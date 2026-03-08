# @hypermarket/engine

Engine package for Hypermarket.

Current scope:

- runtime config and env validation
- structured logging
- API and worker entrypoints
- Prisma schema and migration files
- Redis and BullMQ queue scaffolding
- allowlisted Polymarket market discovery via `GET /markets`

## Market Discovery

The API exposes `GET /markets` to return normalized allowlisted Polymarket
markets using the shared `SupportedMarket` shape from `@hypermarket/shared`.

Required configuration:

- `POLYMARKET_API_URL` should point at the Polymarket Gamma API base URL
- `POLYMARKET_MARKET_ALLOWLIST` should be a comma-separated list of market
  slugs, IDs, or condition IDs

Optional configuration:

- `MARKET_DISCOVERY_CACHE_TTL_MS` controls the in-memory cache TTL for the
  `/markets` response and defaults to `30000`

## Database Workflow

The database schema and migration path have been verified against a real PostgreSQL instance running in Docker.

Verified components:

- Prisma schema validation
- Prisma client generation
- Prisma migration deployment on a fresh database
- DB integration tests covering core MVP ledger constraints

## Verified Local DB Runbook

### 1. Start disposable PostgreSQL

```sh
docker run --name hypermarket-postgres-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hypermarket_test \
  -p 54329:5432 \
  -d postgres:16-alpine
```

### 2. Check readiness

```sh
docker exec hypermarket-postgres-test pg_isready -U postgres -d hypermarket_test
```

### 3. Generate Prisma client

```sh
pnpm --filter @hypermarket/engine db:generate
```

### 4. Apply migration to a fresh database

```sh
env DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/hypermarket_test \
  pnpm --filter @hypermarket/engine exec prisma migrate deploy --schema prisma/schema.prisma
```

### 5. Run DB integration tests

```sh
env DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/hypermarket_test \
  pnpm --filter @hypermarket/engine test:db
```

## Verified Test Coverage

The DB integration suite currently verifies:

- `User` and `MarginAccount` creation
- `Position` lifecycle persistence
- `Settlement.transactionHash` uniqueness
- `Liquidation` foreign key integrity
- `HedgeOrder` status transitions

## Important Note About This Machine

On this machine, Prisma commands that talk to the Docker-backed PostgreSQL instance may need to run outside the default sandbox to reach the local Docker-mapped port reliably.

That is an execution-environment issue, not a schema correctness issue.
