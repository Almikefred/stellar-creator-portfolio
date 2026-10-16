# Soroban contract deploy & upgrade process

How CI deploys the Soroban smart contracts in `backend/contracts/*`, where
the resulting contract addresses go, and how to upgrade a contract that is
already live without breaking its callers.

## Networks

| Network | Workflow | Trigger | Approval |
|---|---|---|---|
| Testnet | [`deploy-contracts.yml`](../.github/workflows/deploy-contracts.yml) | Every push to `main` | None — automatic |
| Mainnet | [`deploy-mainnet.yml`](../.github/workflows/deploy-mainnet.yml) | A GitHub **release** being published (not drafts, not pre-releases) | Manual: the `mainnet` GitHub Environment requires reviewer approval before the job runs |

Merging to `main` only ever reaches Testnet. Mainnet always requires a
deliberate release (see "Promoting to Mainnet" below) — this is enforced by
the workflow trigger itself (`on: release: types: [published]`), not just by
convention.

```mermaid
flowchart LR
    PR[PR merged to main] --> TN[deploy-contracts.yml\nTestnet, automatic]
    TN --> QA[Manual QA on Testnet]
    QA --> REL[Tag + publish a GitHub release\nvX.Y.Z]
    REL --> VAL[validate-release\nsemver tag, not a pre-release]
    VAL --> SIM[simulate-contracts\nsimulate against 2 RPC endpoints]
    SIM --> APPROVAL{{mainnet environment\nreviewer approval}}
    APPROVAL --> DEPLOY[deploy-contracts job\nnode scripts/deploy.js]
    DEPLOY --> FE[deploy-frontend\nVercel production, contract IDs baked in]
```

## What each pipeline does

### Testnet (`deploy-contracts.yml`)

1. `test` — `cargo test --workspace --all-features` against the `backend`
   workspace.
2. `build` — installs `stellar-cli`, builds the bounty / escrow /
   freelancer / governance / oracle / identity contract packages for
   `wasm32-unknown-unknown` (not `wasm32v1-none`; see the comment in the
   workflow — the contracts in this workspace aren't `std`-less), then runs
   `stellar contract optimize` on each `.wasm` and uploads them as a build
   artifact (`contract-wasm-${{ github.sha }}`).
3. `deploy-testnet` — downloads that artifact and runs
   [`scripts/deploy.js`](../scripts/deploy.js) against
   `https://soroban-testnet.stellar.org` using the `TESTNET_DEPLOYER_SECRET`
   repository secret, then writes `contracts.json` (network, commit SHA,
   timestamp, and each contract's deployed ID) and uploads it as its own
   artifact (`contracts-testnet-${{ github.sha }}`).
4. `notify` — posts success/failure to Slack (if `SLACK_WEBHOOK_URL` is
   set) and writes a `$GITHUB_STEP_SUMMARY`.

### Mainnet (`deploy-mainnet.yml`)

1. `validate-release` — rejects the run unless `GITHUB_REF_NAME` is a plain
   semver tag (`vX.Y.Z`) with no pre-release suffix (`v1.0.0-rc.1` is
   rejected). This is the only gate that stands between a release and a
   mainnet deploy, so it fails closed.
2. `simulate-contracts` — rebuilds the same packages, reruns the unit
   tests, then runs `node scripts/deploy.js --simulate-only` against the
   primary Mainnet RPC (blocking) and again against a secondary RPC
   provider for cross-validation (warning-only, so a degraded secondary
   doesn't block a release).
3. `deploy-contracts` — gated on the `mainnet` GitHub Environment (configure
   required reviewers there — this is what makes the deploy "manual
   approval" in practice). Runs `node scripts/deploy.js` for real against
   Mainnet with `MAINNET_DEPLOYER_SECRET`, and exposes each contract ID as a
   job output.
4. `deploy-frontend` — builds the Next.js app with
   `NEXT_PUBLIC_{BOUNTY,ESCROW,FREELANCER,GOVERNANCE,ORACLE,IDENTITY}_CONTRACT_ID`
   set from the previous job's outputs, then deploys to Vercel production.
5. `notify` — Slack + Discord with every contract ID, plus a step summary.

## Where contract addresses go

There is no single "contracts registry" file in the repo — addresses are
produced per deploy and consumed by whichever layer needs them:

- **Testnet**: written to `contracts.json` and uploaded as the
  `contracts-testnet-${{ github.sha }}` build artifact. There's no automatic
  publish step beyond that artifact today; if you need the Testnet IDs
  outside of CI, download that artifact from the workflow run (see
  `docs/contracts.md#promoting-to-mainnet` for the equivalent idea applied to
  Mainnet).
- **Mainnet**: emitted as `deploy-contracts` job outputs
  (`bounty_contract_id`, `escrow_contract_id`, `freelancer_contract_id`,
  `governance_contract_id`, `oracle_contract_id`, `identity_contract_id`),
  which `deploy-frontend` reads directly and bakes into the Next.js build as
  `NEXT_PUBLIC_*_CONTRACT_ID`. They are also broadcast to Slack/Discord and
  the GitHub Actions run summary for a human-readable record of what's live.
- **Local dev**: `.env.local` (see `.env.example`) — there is no automated
  sync from a deploy back into `.env.example`; update it by hand after a
  Mainnet/Testnet address changes if local tooling needs to point at it.

## Promoting to Mainnet

1. Confirm the commit has been live on Testnet and manually exercised.
2. Tag it and publish a GitHub release with a plain semver tag, e.g. `v1.4.0`
   — publishing a **draft** or a **pre-release** tag will not trigger
   `deploy-mainnet.yml` at all (draft) or will be rejected by
   `validate-release` (pre-release suffix).
3. The `mainnet` GitHub Environment will block `deploy-contracts` until a
   configured reviewer approves the run — approve it from the Actions tab
   once you've checked `simulate-contracts` passed cleanly.
4. After `deploy-frontend` finishes, confirm the new contract IDs in the
   Slack/Discord notification (or the run's `$GITHUB_STEP_SUMMARY`) match
   what you expect before telling anyone the release is out.

## Upgrading a contract that is already live

Every contract in `backend/contracts/*` exposes an admin-gated `upgrade`
entrypoint (see e.g. `backend/contracts/escrow/src/lib.rs`):

```rust
pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
    admin.require_auth();
    // ...asserts `admin` matches the stored platform admin...
    env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
    env.events().publish((symbol_short!("contract"), symbol_short!("upgraded")), new_wasm_hash);
}
```

This replaces the contract's executable code **in place** — the contract ID
(and therefore every integrator's config, every reference in the frontend's
`NEXT_PUBLIC_*_CONTRACT_ID`, every other contract that calls into it) stays
the same. Persistent storage is untouched by the upgrade itself, so any
storage-shape change in the new code must be handled by the new code reading
old-shape data (a migration function, or defensive deserialization) — Soroban
does not migrate storage for you.

Safe upgrade procedure:

1. Build and optimize the new `.wasm` the same way CI does (`cargo build
   --release --target wasm32-unknown-unknown`, then `stellar contract
   optimize`) so the deployed bytecode matches what was reviewed.
2. Upload the new wasm to get its hash:
   `stellar contract upload --wasm <path> --source <admin-identity> --network <network>`.
3. Simulate the `upgrade` call first (`stellar contract invoke --is-view`
   where supported, or a Testnet dry run) to confirm the new wasm hash and
   admin signature are both accepted before touching Mainnet.
4. Call `upgrade(admin, new_wasm_hash)` from the platform admin key. Because
   this requires `admin.require_auth()`, only the holder of the stored
   `platform_admin` address can do this — treat that key with the same care
   as `MAINNET_DEPLOYER_SECRET`.
5. Watch for the `(contract, upgraded)` event to confirm the swap landed,
   and smoke-test a read and a write entrypoint against the live contract ID
   immediately after.
6. Record the new wasm hash wherever `contracts.json` / the deploy
   notification would otherwise be stale — the contract ID doesn't change,
   but the code it points to did, so anyone diffing deployed bytecode needs
   the new hash.

Never deploy a *new* contract ID as a stand-in for "upgrading" unless you
specifically want a breaking migration (new ID, old integrators silently
pointed at dead code) — that's a distinct, much more disruptive operation
than calling `upgrade`, and isn't what CI's Mainnet pipeline does on a normal
release (a normal release only redeploys code behind IDs that didn't already
exist; it doesn't call `upgrade` on existing ones — that's a deliberate,
separate, manual step per the procedure above).
