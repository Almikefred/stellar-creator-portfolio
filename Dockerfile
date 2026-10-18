# Reproducible Soroban contract builder.
#
# Mirrors the stellar/soroban-tools image environment so the WASM output is
# byte-for-byte identical regardless of where this runs (CI or local).
#
# Pinned versions — bump deliberately and re-verify hashes.
FROM rust:1.89.0-slim AS builder

# Reproducibility: no incremental compilation, deterministic codegen.
ENV CARGO_INCREMENTAL=0 \
    CARGO_NET_RETRY=10 \
    RUSTFLAGS="-C codegen-units=1" \
    SOURCE_DATE_EPOCH=0

# soroban-sdk 23 only supports wasm32v1-none on Rust >= 1.82.
RUN rustup target add wasm32v1-none

WORKDIR /build

# Copy lockfile + manifests first so dependency layer is cached separately.
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/contracts ./contracts
COPY backend/services  ./services
COPY backend/tests     ./tests

# Build all contracts in release mode.
RUN cargo build --release --target wasm32v1-none \
        --package stellar-bounty-contract \
        --package stellar-escrow-contract \
        --package stellar-freelancer-contract \
        --package stellar-governance-contract

# ── Output stage ────────────────────────────────────────────────────────────
FROM scratch AS artifacts
COPY --from=builder /build/target/wasm32v1-none/release/stellar_bounty_contract.wasm     /bounty.wasm
COPY --from=builder /build/target/wasm32v1-none/release/stellar_escrow_contract.wasm     /escrow.wasm
COPY --from=builder /build/target/wasm32v1-none/release/stellar_freelancer_contract.wasm /freelancer.wasm
COPY --from=builder /build/target/wasm32v1-none/release/stellar_governance_contract.wasm /governance.wasm
