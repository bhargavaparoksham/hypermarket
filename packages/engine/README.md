# @hypermarket/engine

Engine package for Hypermarket.

Current scope:

- runtime config and env validation
- structured logging
- API and worker entrypoints
- Prisma schema and migration files
- Redis and BullMQ queue scaffolding
- allowlisted Polymarket market discovery via `GET /markets`
- allowlisted Polymarket price ingestion into Redis via the worker
- market price reads via `GET /markets/:marketId/prices`
- account and position domain services for open/increase/reduce/close flows
- vault-balance sync service that mirrors on-chain settled collateral into margin accounts
- settlement lifecycle service with on-chain submission/reconciliation via `viem`

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

## Price Ingestion

The worker now:

- resolves allowlisted markets to Polymarket outcome token IDs
- subscribes to the CLOB market websocket for only those token IDs
- tracks `bestBid`, `bestAsk`, `midpoint`, `lastTradePrice`, and `markPrice`
- writes current snapshots plus capped recent history into Redis

The API exposes `GET /markets/:marketId/prices` to read the latest cached price
snapshots for that market.

Staleness is currently derived from the shared
`RISK_PARAMETERS.stalePriceThresholdMs` value.

Current mark-price policy:

- use midpoint only when the current book is internally consistent and the
  spread is not excessively wide
- fall back to fresh last trade when the book is thin or distorted
- preserve the prior mark if new data is unusable
- clamp per-update mark jumps to reduce abrupt outliers

## Position Domain Logic

The engine now includes service-layer domain logic for:

- creating user and margin-account records on demand
- syncing margin-account aggregates from active positions
- opening long and short positions
- averaging into an existing open position on the same market/outcome/side
- partial close and full close flows
- realized PnL updates and position status transitions

This logic currently lives in:

- `src/services/account-service.ts`
- `src/services/position-service.ts`

It is covered by focused service tests.

## Margin And PnL Formulas

The engine now has a dedicated formula layer in
`src/services/risk-formulas.ts` for:

- position notional
- initial and maintenance margin
- unrealized PnL for long and short positions
- trade fees
- equity, free collateral, and margin ratio

The existing account and position services now use this formula layer for
derived values instead of duplicating calculations inline.

The next layer to tighten is 5.3: liquidation threshold and liquidation-state
logic on top of these formulas.

## Liquidation Logic

The engine now includes a liquidation service in
`src/services/liquidation-service.ts` that handles:

- liquidation threshold calculation
- candidate scanning against current mark prices
- liquidation record creation
- queue job creation for liquidations
- position transition to `LIQUIDATING`
- final liquidation settlement to `LIQUIDATED`

The reference `10x` long at `0.50` now produces a liquidation price of
approximately `0.455`, and that case is covered in tests.

## Vault Balance Sync

The engine now includes a service-layer vault sync path in
`src/services/vault-sync-service.ts` for Phase `6.1`.

Current behavior:

- reads canonical `HyperVault.settledBalance(user)` via an injected balance reader
- ensures the engine `User` and `MarginAccount` exist for that wallet
- mirrors the on-chain settled balance into `MarginAccount.settledBalance`
- immediately recomputes equity and free collateral from active positions
- reports net pending settlement delta from `PENDING` and `SUBMITTED`
  settlement records without applying that delta to `settledBalance`

Pending settlement policy for now:

- on-chain vault balance is the source of truth for mirrored `settledBalance`
- `PENDING` and `SUBMITTED` settlements are tracked as informational in-flight
  deltas only
- `CONFIRMED` settlements should be reflected by the next on-chain mirror pass

This avoids double-counting now that settlement submission and reconciliation
run as a separate lifecycle on top of the mirrored on-chain balance.

## Settlement Bridge

The engine now includes a settlement lifecycle in
`src/services/settlement-service.ts` plus a `viem` HyperVault client in
`src/services/hypervault-client.ts`.

Current behavior:

- close and liquidation flows can create `PENDING` settlement records and enqueue jobs
- the settlement worker submits `HyperVault.settle(user, pnl)` from the manager wallet
- submitted settlements are reconciled against on-chain receipts and the emitted
  `Settled` event
- confirmed settlements trigger a fresh vault-balance mirror back into the
  engine margin account
- the worker also polls known wallets periodically to mirror deposit and
  withdrawal changes

New worker polling configuration:

- `SETTLEMENT_RECONCILE_INTERVAL_MS` defaults to `5000`
- `VAULT_SYNC_INTERVAL_MS` defaults to `15000`

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
