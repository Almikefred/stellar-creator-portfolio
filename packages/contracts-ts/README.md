# @stellar-creator/contracts-ts

Typed TypeScript clients for the canonical Soroban contracts in
[`backend/contracts`](../../backend/contracts), generated from the compiled
WASM with the `@stellar/stellar-sdk` bindings generator.

| Module | Contract crate |
|---|---|
| `bounty` | `stellar-bounty-contract` |
| `escrow` | `stellar-escrow-contract` |
| `freelancer` | `stellar-freelancer-contract` |
| `governance` | `stellar-governance-contract` |
| `identity` | `stellar-identity-contract` |
| `oracle` | `oracle` |

## Regenerating

`src/<contract>/` is generated. Don't edit it by hand. After changing a
contract's public interface, run:

```sh
pnpm install                              # provides the stellar-js generator
./scripts/generate-contract-bindings.sh   # needs cargo + the wasm32v1-none target
```

Commit the result. The `contract-bindings` CI job regenerates the bindings
and fails if they differ from what is committed.

## Using

In the app, prefer the helpers in [`lib/soroban/contract-clients.ts`](../../lib/soroban/contract-clients.ts).
They resolve the contract ID from `deployments/<network>.json` and encode
arguments against the contract spec. To use a client directly:

```ts
import { escrow } from '@/packages/contracts-ts/src';

const client = new escrow.Client({ contractId, networkPassphrase, rpcUrl });
const tx = await client.get_escrow({ escrow_id: 1n });
console.log(tx.result);
```
