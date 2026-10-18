#!/usr/bin/env node
/**
 * scripts/deploy.cjs
 *
 * Deploys (or simulates) Soroban contracts to the Stellar network.
 *
 * Required env vars:
 *   STELLAR_NETWORK            - "mainnet" | "testnet"
 *   STELLAR_RPC_URL            - Soroban RPC endpoint
 *   STELLAR_NETWORK_PASSPHRASE - Network passphrase
 *   STELLAR_ADMIN_SECRET       - Deployer secret key (skipped in --simulate-only)
 *
 * Flags:
 *   --simulate-only    Run preflight simulations only; do not submit transactions.
 *   --manifest <path>  After deploying, write the contract IDs and WASM hashes to
 *                      <path> (e.g. deployments/testnet.json). See docs/deployments.md.
 */

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SIMULATE_ONLY = process.argv.includes("--simulate-only");
const manifestFlag = process.argv.indexOf("--manifest");
const MANIFEST_PATH = manifestFlag !== -1 ? process.argv[manifestFlag + 1] : null;
if (manifestFlag !== -1 && !MANIFEST_PATH) {
  console.error("❌ --manifest requires a file path.");
  process.exit(1);
}

const NETWORK = process.env.STELLAR_NETWORK;
const RPC_URL = process.env.STELLAR_RPC_URL;
const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE;
const ADMIN_SECRET = process.env.STELLAR_ADMIN_SECRET;

// Guard: refuse to run against mainnet without an explicit network flag.
if (NETWORK === "mainnet" && !SIMULATE_ONLY && !ADMIN_SECRET) {
  console.error("❌ STELLAR_ADMIN_SECRET is required for mainnet deployments.");
  process.exit(1);
}

if (!RPC_URL) {
  console.error("❌ STELLAR_RPC_URL is not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Contracts to deploy (name → wasm path relative to repo root)
// ---------------------------------------------------------------------------

// Defaults to the output of scripts/build-reproducible.sh.
const WASM_DIR = process.env.WASM_DIR || "artifacts";

const CONTRACTS = [
  { name: "bounty",     wasm: `${WASM_DIR}/bounty.wasm`,     outputKey: "bounty_contract_id" },
  { name: "escrow",     wasm: `${WASM_DIR}/escrow.wasm`,     outputKey: "escrow_contract_id" },
  { name: "freelancer", wasm: `${WASM_DIR}/freelancer.wasm`, outputKey: "freelancer_contract_id" },
  { name: "governance", wasm: `${WASM_DIR}/governance.wasm`, outputKey: "governance_contract_id" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
}

/** Emit a GitHub Actions output variable (no-op outside CI). */
function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${key}=${value}\n`);
  }
  console.log(`  → ${key}=${value}`);
}

// ---------------------------------------------------------------------------
// Simulate: preflight each contract upload against the RPC
// ---------------------------------------------------------------------------

function simulateContract(contract) {
  const wasmPath = path.resolve(contract.wasm);
  if (!fs.existsSync(wasmPath)) {
    console.error(`❌ WASM not found: ${wasmPath}`);
    process.exit(1);
  }

  console.log(`  Simulating ${contract.name}…`);
  // stellar contract upload --simulate validates the wasm against the RPC
  // without submitting a transaction.
  run(
    `stellar contract upload \
      --wasm "${wasmPath}" \
      --rpc-url "${RPC_URL}" \
      --network-passphrase "${PASSPHRASE}" \
      --simulate`
  );
  console.log(`  ✅ ${contract.name} simulation passed`);
}

// ---------------------------------------------------------------------------
// Deploy: upload wasm + instantiate contract
// ---------------------------------------------------------------------------

function deployContract(contract) {
  const wasmPath = path.resolve(contract.wasm);
  if (!fs.existsSync(wasmPath)) {
    console.error(`❌ WASM not found: ${wasmPath}`);
    process.exit(1);
  }

  console.log(`  Uploading ${contract.name}…`);
  const wasmHash = run(
    `stellar contract upload \
      --wasm "${wasmPath}" \
      --rpc-url "${RPC_URL}" \
      --network-passphrase "${PASSPHRASE}" \
      --source "${ADMIN_SECRET}"`
  );

  console.log(`  Deploying ${contract.name} (hash: ${wasmHash})…`);
  const contractId = run(
    `stellar contract deploy \
      --wasm-hash "${wasmHash}" \
      --rpc-url "${RPC_URL}" \
      --network-passphrase "${PASSPHRASE}" \
      --source "${ADMIN_SECRET}"`
  );

  setOutput(contract.outputKey, contractId);
  return { id: contractId, wasmHash };
}

/**
 * Write the deployment manifest consumed by the app (lib/contracts/deployments.ts).
 * Schema: { network, contracts: { name: { id, wasmHash } }, gitSha, deployedAt }
 */
function writeManifest(manifestPath, contracts) {
  let gitSha = process.env.GITHUB_SHA;
  if (!gitSha) {
    try {
      gitSha = run("git rev-parse HEAD");
    } catch {
      gitSha = null;
    }
  }
  const manifest = {
    network: NETWORK,
    contracts,
    gitSha,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(path.resolve(manifestPath)), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  📝 Manifest written to ${manifestPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\n🚀 Stellar Contract ${SIMULATE_ONLY ? "Simulation" : "Deployment"}`);
console.log(`   Network : ${NETWORK ?? "(not set)"}`);
console.log(`   RPC     : ${RPC_URL}`);
console.log(`   Mode    : ${SIMULATE_ONLY ? "simulate-only" : "deploy"}\n`);

const deployed = {};
for (const contract of CONTRACTS) {
  if (SIMULATE_ONLY) {
    simulateContract(contract);
  } else {
    deployed[contract.name] = deployContract(contract);
  }
}

if (MANIFEST_PATH && !SIMULATE_ONLY) {
  writeManifest(MANIFEST_PATH, deployed);
}

console.log(`\n✅ All contracts ${SIMULATE_ONLY ? "simulated" : "deployed"} successfully.\n`);
