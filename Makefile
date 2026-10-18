.PHONY: help check-all check-backend check-contracts check-frontend lint-be test-be lint-fe dev dev-down dev-status dev-logs dev-deps

TERRAFORM_VERSION := 1.10.5

# Pin to a reproducible version; update here and in any runtime images/installers in lock.hellpoints if relevant.
help:
	@echo "Available commands:"
	@echo "  make dev             - Boot Postgres, Redis, Rust API and Next.js frontend for local dev"
	@echo "  make dev-deps        - Boot only the backing services (Postgres, Redis, Rust API) in background"
	@echo "  make dev-down        - Stop background development containers"
	@echo "  make dev-status      - Check status of local development containers"
	@echo "  make dev-logs        - Stream logs from all background development containers"
	@echo "  make check-all       - Run all project lints and tests"
	@echo "  make check-backend   - Run Clippy and tests for backend services"
	@echo "  make check-contracts - Run tests for Soroban smart contracts"
	@echo "  make check-frontend  - Run lint, typecheck, tests and build for the Next.js frontend"
	@echo "  make lint-be         - Run cargo clippy on backend"
	@echo "  make test-be         - Run cargo tests on backend"
	@echo "  make lint-fe         - Run lint, typecheck and unit tests on frontend"

# Boot full local stack: Postgres, Redis, Rust API, then start Next.js frontend
dev: dev-deps
	@echo ""
	@echo "🚀 Development environment ready!"
	@echo "Starting Next.js frontend with Hot Module Replacement on http://localhost:3000..."
	@echo ""
	pnpm run dev

# Start background services: PostgreSQL (5432), Redis (6379), Rust API (3001)
dev-deps:
	@echo "Starting background services (Postgres, Redis, Rust API)..."
	@docker compose -f backend/docker-compose.yml up -d postgres redis api 2>/dev/null || \
		docker-compose -f backend/docker-compose.yml up -d postgres redis api
	@echo "Backing services status:"
	@echo "  - PostgreSQL: localhost:5432 (stellar / stellar_dev_password)"
	@echo "  - Redis:      localhost:6379"
	@echo "  - Rust API:   http://localhost:3001"

# Stop background development containers
dev-down:
	@echo "Stopping local development services..."
	@docker compose -f backend/docker-compose.yml down 2>/dev/null || \
		docker-compose -f backend/docker-compose.yml down

# Check running development containers
dev-status:
	@docker compose -f backend/docker-compose.yml ps 2>/dev/null || \
		docker-compose -f backend/docker-compose.yml ps

# Follow container logs
dev-logs:
	@docker compose -f backend/docker-compose.yml logs -f 2>/dev/null || \
		docker-compose -f backend/docker-compose.yml logs -f

check-all: check-frontend check-backend check-contracts

check-backend: lint-be test-be

check-contracts:
	@echo "Checking smart contracts..."
	./scripts/check-contract-panics.sh
	cd backend && cargo test --all-features

check-frontend: lint-fe
	@echo "Checking frontend build..."
	pnpm run build

lint-be:
	@echo "Running clippy on backend..."
	cd backend && cargo clippy --workspace --all-targets --all-features -- -D warnings

test-be:
	@echo "Running backend tests..."
	cd backend && cargo test

lint-fe:
	@echo "Running frontend lint..."
	pnpm run lint
	pnpm run typecheck
	pnpm test
