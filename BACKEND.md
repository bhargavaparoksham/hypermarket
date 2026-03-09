# Hypermarket Backend

This document is the operational handoff for the backend side of the repo:

- `packages/contracts`
- `packages/engine`
- local PostgreSQL / Prisma workflow
- backend test commands

## Current Backend Scope

Completed through Phase `6.2`:

- Polymarket market discovery
- Polymarket price ingestion and mark-price policy
- account and position domain logic
- margin, PnL, and liquidation logic
- vault balance mirroring into engine account state
- settlement submission and reconciliation via `viem`

Now also completed:

- Phase `7.1` exposure aggregation
- Phase `7.2` service-layer hedge executor foundation
- Phase `7.2` token-aware hedge proxy client and worker polling loop

Current backend status:

- contract settlement layer exists in `HyperVault`
- engine tracks positions and risk off-chain
- worker can process settlement jobs and poll vault balances
- hedge polling can evaluate exposure and create token-aware hedge intents
- live Polymarket hedge execution is still deferred; current support is dry-run
  or external proxy mode only
- local backend test stack is runnable with one command

## Key Backend Paths

Contracts:

- `packages/contracts/src/HyperVault.sol`
- `packages/contracts/src/MockUSDC.sol`

Engine:

- `packages/engine/src/markets`
- `packages/engine/src/prices`
- `packages/engine/src/services`
- `packages/engine/src/workers`
- `packages/engine/prisma/schema.prisma`

## Backend Test Commands

Fast backend suite:

```sh
pnpm test
```

This runs:

- contract tests via `forge test --offline`
- engine service/unit suites

Full backend suite including DB integration:

```sh
pnpm test:full
```

This runs:

- `pnpm test`
- `pnpm test:db`

DB-only backend validation:

```sh
pnpm test:db
```

## Local DB Workflow

Local PostgreSQL test database:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/hypermarket_test
```

Bring up the test DB:

```sh
pnpm db:test:up
```

If it already exists but is stopped:

```sh
pnpm db:test:start
```

Stop it:

```sh
pnpm db:test:stop
```

Engine local DB env file:

- `packages/engine/.env.test`

That local script path now does:

- Prisma client generation
- migration deploy
- engine DB integration tests

## Current Automated Backend Coverage

Contracts:

- vault deposit / withdraw
- settlement credit / debit
- access control
- pause and protocol liquidity behavior

Engine service/unit:

- market discovery
- price parsing and mark policy
- formulas
- account / position domain logic
- liquidation lifecycle
- exposure aggregation
- hedge execution decisioning and persistence
- hedge proxy client normalization and dry-run execution mode
- settlement lifecycle
- vault sync logic

Engine DB integration:

- `User` and `MarginAccount` persistence
- `Position` lifecycle persistence
- `Settlement.transactionHash` uniqueness
- `Liquidation` FK integrity
- `HedgeOrder` persistence transitions

## Current Gaps

Still missing from backend automation:

- worker-level retry/idempotency tests
- full Redis + BullMQ integration tests
- API integration tests
- live chain settlement smoke test in the automated path
- live Polymarket integration in the automated path

Important hedge status:

- the engine can now decide when to hedge and persist `HedgeOrder` state
- the repo does not yet contain direct live Polymarket order signing/submission
- current live execution depends on an external hedge proxy; otherwise the
  system should stay in dry-run mode

## Deferred Backend Follow-Up

Deferred item: direct live hedge execution for Phase `7.2`.

Suggested scope:

- wire a real Polymarket order-signing/submission path behind the current hedge proxy boundary
- add retries and orchestration for `HedgeOrder` lifecycle transitions
- expose internal hedge state for debugging after worker plumbing lands

Recommended artifacts:

- `src/services/polymarket-hedge-client.ts`
- `src/workers/hedge-worker.ts`
- focused tests around adapter and retry behavior
