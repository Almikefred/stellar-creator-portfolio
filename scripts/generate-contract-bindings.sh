#!/usr/bin/env bash
# scripts/generate-contract-bindings.sh
#
# Builds the canonical contracts and regenerates their TypeScript bindings into
# packages/contracts-ts/src/<name>/ using the @stellar/stellar-sdk CLI.
# CI runs this and fails if the committed bindings differ (see ci.yml).
#
# Usage:
#   ./scripts/generate-contract-bindings.sh
#
# Requires: cargo with the wasm32v1-none target, and `pnpm install` run at the
# repo root (provides the `stellar-js` binary). Set STELLAR_JS to override the
# generator command.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/packages/contracts-ts/src"
WASM_DIR="$REPO_ROOT/backend/target/wasm32v1-none/release"
STELLAR_JS="${STELLAR_JS:-pnpm --dir $REPO_ROOT exec stellar-js}"
CONTRACTS=(bounty escrow freelancer governance)

echo "🔨 Building contracts…"
PKGS=()
for c in "${CONTRACTS[@]}"; do PKGS+=(-p "stellar-${c}-contract"); done
(cd "$REPO_ROOT/backend" && cargo build --release --target wasm32v1-none "${PKGS[@]}")

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for c in "${CONTRACTS[@]}"; do
  echo "🧬 Generating bindings for ${c}…"
  $STELLAR_JS generate \
    --wasm "$WASM_DIR/stellar_${c}_contract.wasm" \
    --contract-name "$c" \
    --output-dir "$TMP/$c" \
    --overwrite >/dev/null
  rm -rf "${OUT_DIR:?}/$c"
  mkdir -p "$OUT_DIR/$c"
  cp "$TMP/$c"/src/*.ts "$OUT_DIR/$c/"
done

echo "✅ Bindings written to packages/contracts-ts/src/"
