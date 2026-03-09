# Hypermarket MVP Todo

This document is the execution checklist for getting Hypermarket from an empty repo to a testable MVP on testnet.

Rules for using this file:

- each item should end in a concrete artifact or verifiable outcome
- do not start a later dependency-heavy item before its prerequisites are done
- update status as work lands
- keep scope narrow enough that each item can be implemented and reviewed cleanly

## Status Key

- `[ ]` not started
- `[~]` in progress
- `[x]` completed
- `[!]` blocked

## Current Verified Test Commands

- [x] Root backend aggregate: `pnpm test`
- [x] Root backend + DB aggregate: `pnpm test:full`
- [x] Engine DB integration against local Docker PostgreSQL: `pnpm test:db`

Notes:

- `pnpm test` currently covers contracts plus the engine service/unit suites
- `pnpm test:full` adds Prisma migration + DB integration coverage on top
- `packages/shared` and `packages/web` still do not have dedicated real test suites

## Current Recommended Next Task

This is the next task to pick up. If you are resuming work, start here unless priorities have changed.

- Phase `7.2`: implement hedge executor
- First implementation target: `packages/engine/src/services/hedge-execution-service.ts`
- First test target: `packages/engine/test/hedge-execution.test.mjs`

Scope for this task:

- consume Phase `7.1` exposure snapshots to decide when hedges should be placed
- add a Polymarket execution adapter or stubbed executor boundary
- persist hedge attempts and status transitions in `HedgeOrder`
- keep the first change set service-layer focused before adding worker orchestration or external APIs

Why this is next:

- Phase `7.1` exposure aggregation is now available as a service-layer dependency
- the next missing backend dependency is acting on threshold breaches
- this keeps the next change set focused on execution decisions before worker wiring

## Phase 0: Repo Foundation

### 0.1 Initialize monorepo

- [x] Create root `package.json` with `pnpm` workspaces
- [x] Add top-level package scripts for build, lint, test, and dev
- [x] Create `packages/contracts`
- [x] Create `packages/engine`
- [x] Create `packages/web`
- [x] Create `packages/shared`
- [x] Add root `.gitignore`
- [x] Add base `README.md` references to package responsibilities

Exit criteria:

- repo installs with one package manager command
- workspace layout matches architecture doc
- root scripts resolve cleanly even if package internals are still placeholders

### 0.2 Add common TypeScript and formatting setup

- [x] Add root `tsconfig` base config
- [x] Add package-level `tsconfig` files where needed
- [x] Add ESLint config
- [x] Add Prettier config
- [x] Add environment variable example files

Exit criteria:

- TypeScript packages compile
- lint and formatting commands run from root

## Phase 1: Shared Package

### 1.1 Create `packages/shared` package

- [x] Add package manifest
- [x] Add exports for constants, enums, and shared types
- [x] Define market, position, account, settlement, and liquidation types
- [x] Define chain IDs and contract address placeholders
- [x] Define leverage and risk parameter constants

Exit criteria:

- engine and web can import shared domain types from one place

### 1.2 Add contract ABI publishing flow

- [x] Add generated or placeholder ABI export structure
- [x] Add shared vault interface types
- [x] Document how contract artifacts are synced into shared

Exit criteria:

- web and engine have one stable import path for `HyperVault` ABI and address config

## Phase 2: Contracts

### 2.1 Bootstrap Foundry project

- [x] Add Foundry config files in `packages/contracts`
- [x] Add dependency setup for OpenZeppelin or equivalent minimal libraries
- [x] Add deployment script skeleton
- [x] Add test folder structure

Exit criteria:

- contracts package builds and tests through Foundry

### 2.2 Implement mock USDC

- [x] Add `MockUSDC.sol`
- [x] Mint test balances for local and testnet flows
- [x] Add tests for minting and transfer assumptions used by vault tests

Exit criteria:

- local and testnet environments have a stable collateral token for MVP validation

### 2.3 Implement `HyperVault.sol`

- [x] Add constructor with USDC address and admin setup
- [x] Implement `deposit(uint256 amount)`
- [x] Implement `withdraw(uint256 amount)`
- [x] Implement restricted `settle(address user, int256 pnl)`
- [x] Implement manager update flow
- [x] Add pause or emergency controls if kept in MVP scope
- [x] Emit events for deposit, withdraw, settlement, and manager changes

Exit criteria:

- users can deposit and withdraw collateral
- backend manager can realize positive and negative PnL
- unauthorized settlement attempts revert

### 2.4 Contract test coverage

- [x] Add unit tests for deposits
- [x] Add unit tests for withdrawals
- [x] Add unit tests for settlement credit
- [x] Add unit tests for settlement debit
- [x] Add unit tests for access control
- [x] Add unit tests for edge cases like overdraft and zero amounts

Exit criteria:

- contract behavior is covered for normal path and failure path scenarios

### 2.5 Testnet deployment path

- [x] Add deploy config for chosen Polygon-compatible testnet
- [x] Add deploy script for `MockUSDC`
- [x] Add deploy script for `HyperVault`
- [x] Add verification instructions or script placeholders
- [x] Record deployed addresses for shared package consumption

Exit criteria:

- contracts can be deployed and referenced by engine and web on testnet

## Phase 3: Database and Engine Foundation

### 3.1 Bootstrap engine package

- [x] Add package manifest
- [x] Add TypeScript runtime config
- [x] Add entrypoints for API server and background workers
- [x] Add config loader and env validation
- [x] Add structured logging

Exit criteria:

- engine starts locally with explicit config errors if env is incomplete

### 3.2 Add PostgreSQL and Prisma

- [x] Add Prisma schema
- [x] Define `User` model
- [x] Define `MarginAccount` model
- [x] Define `Position` model
- [x] Define `Settlement` model
- [x] Define `Liquidation` model
- [x] Define `HedgeOrder` model
- [x] Add initial migration
- [x] Add seed script if useful for local development

Exit criteria:

- database schema supports the MVP lifecycle from deposit mirror through close and liquidation

### 3.3 Add Redis and BullMQ infrastructure

- [x] Add Redis client wrapper
- [x] Add queue definitions for liquidation and settlement jobs
- [x] Add worker bootstrapping
- [x] Add retry and idempotency strategy notes in code

Exit criteria:

- engine can enqueue and process background jobs deterministically

## Phase 4: Polymarket Market Data

### 4.1 Integrate market discovery

- [x] Add Polymarket client module
- [x] Fetch a configurable allowlist of markets
- [x] Normalize market metadata into shared shapes
- [x] Expose engine endpoint for live markets

Exit criteria:

- web can list supported Polymarket markets from engine data

### 4.2 Implement price ingestion

- [x] Connect to Polymarket CLOB or market data source
- [x] Track best bid, ask, midpoint, and last trade
- [x] Publish mark prices into Redis
- [x] Persist useful snapshots if needed for debugging
- [x] Add stale-price detection

Exit criteria:

- engine maintains a current mark price stream for MVP markets
- verified with unit tests for parsing/storage/feed wiring and a live Redis +
  Polymarket websocket smoke test against an active market

### 4.3 Define mark-price policy

- [x] Implement midpoint-based mark price logic
- [x] Add fallback rules for thin books or stale data
- [x] Clamp abnormal price jumps with explicit guardrails
- [x] Add tests for mark-price calculation behavior

Exit criteria:

- risk calculations rely on one consistent mark-price function
- verified in a live smoke test against an active market with a distorted book,
  where raw midpoint was rejected and mark price fell back to last trade

## Phase 5: Risk Engine and Position Ledger

### 5.1 Implement account and position domain logic

- [x] Add account service
- [x] Add position service
- [x] Support opening long positions
- [x] Support opening short positions
- [x] Support partial close
- [x] Support full close
- [x] Implement average entry calculations

Exit criteria:

- engine can create and update virtual positions correctly in PostgreSQL
- service-layer domain logic is covered for open/add/reduce/close flows and
  margin-account aggregate syncing

### 5.2 Implement margin and PnL calculations

- [x] Compute notional, initial margin, maintenance margin, and equity
- [x] Compute unrealized PnL for long and short positions
- [x] Compute free collateral and margin ratio
- [x] Implement configurable fees and buffers
- [x] Add unit tests for core formulas

Exit criteria:

- risk values are deterministic and covered by tests
- formula layer is integrated into account and position services for derived
  values

### 5.3 Implement liquidation logic

- [x] Compute liquidation thresholds
- [x] Implement liquidation candidate scanner
- [x] Create liquidation jobs
- [x] Apply liquidation state transitions to positions and accounts
- [x] Record liquidation events in the database
- [x] Add tests using the `10x long at 0.50 -> liquidate near 0.455` reference scenario

Exit criteria:

- liquidatable positions are detected and closed consistently before bankruptcy
- service-layer liquidation lifecycle is covered for detect -> queue ->
  liquidating -> liquidated

## Phase 6: Settlement Bridge

### 6.1 Mirror vault state into engine account state

- [x] Add on-chain event ingestion or read path for deposits and withdrawals
- [x] Sync settled balances into engine accounts
- [x] Handle pending settlement states cleanly

Exit criteria:

- engine account equity reflects current on-chain settled balance plus off-chain unrealized state

### 6.2 Implement settlement service

- [x] Add on-chain transaction client with `viem`
- [x] Submit `settle(address user, int256 pnl)` from manager wallet
- [x] Persist transaction state and retries
- [x] Prevent duplicate settlement application
- [x] Reconcile on-chain events back into database state

Exit criteria:

- close and liquidation flows can realize PnL back into the vault safely

## Phase 7: Hedging and Exposure Controls

### 7.1 Add exposure aggregation

- [x] Aggregate user exposure by market and side
- [x] Define per-market hedge thresholds
- [x] Expose internal risk metrics for debugging

Exit criteria:

- engine can tell when internal virtual exposure is too large
- verified with a focused service test suite covering active-status filtering,
  per-market long/short aggregation, and market subset filtering

### 7.2 Implement hedge executor

- [ ] Add Polymarket order execution client or stub adapter
- [ ] Place hedge orders when thresholds are breached
- [ ] Persist hedge attempts and results
- [ ] Add failure handling and manual recovery notes

Exit criteria:

- MVP can reduce aggregate protocol exposure for supported markets

## Phase 8: Web App

### 8.1 Bootstrap Next.js app

- [ ] Initialize Next.js App Router app
- [ ] Add Tailwind CSS
- [ ] Add wallet connection with `wagmi` and `viem`
- [ ] Add app-level providers and env config

Exit criteria:

- web app runs locally and connects to wallet + engine

### 8.2 Build core trading terminal

- [ ] Add `Live Markets` sidebar
- [ ] Add market detail panel
- [ ] Add leverage slider from `1x` to `5x`
- [ ] Add order ticket for long and short
- [ ] Add account summary card
- [ ] Add positions table with size, entry, mark, liq, and PnL

Exit criteria:

- a user can view markets, inspect risk, and submit virtual trades from the UI

### 8.3 Add deposit and withdraw flows

- [ ] Add USDC approval flow
- [ ] Add vault deposit flow
- [ ] Add vault withdraw flow
- [ ] Show settled balance and pending actions
- [ ] Handle transaction success and failure states

Exit criteria:

- user can move collateral into and out of the vault from the app

### 8.4 Add real-time updates

- [ ] Stream live prices into the terminal
- [ ] Stream account and position changes
- [ ] Refresh liquidation state with low latency

Exit criteria:

- UI feels live without requiring manual refresh after every trade

## Phase 9: API Layer and Auth

### 9.1 Expose engine endpoints

- [ ] `GET /markets`
- [ ] `GET /markets/:marketId`
- [ ] `GET /accounts/:address`
- [ ] `GET /positions/:address`
- [ ] `POST /trade`
- [ ] `POST /close`

Exit criteria:

- web can drive the full MVP through documented engine endpoints

### 9.2 Add request authentication

- [ ] Add wallet-based auth or signed message verification
- [ ] Bind user actions to wallet address
- [ ] Protect manager-only or internal endpoints

Exit criteria:

- trade requests are attributable and cannot be spoofed trivially

## Phase 10: End-to-End Testnet Readiness

### 10.1 Local integration environment

- [ ] Add local run instructions
- [ ] Add local `.env.example` coverage for all packages
- [ ] Add scripted startup path for db, redis, engine, and web
- [ ] Run deposit -> trade -> close -> withdraw flow locally

Exit criteria:

- contributors can boot the MVP locally and exercise the main path

### 10.2 Testnet environment

- [ ] Choose target testnet and document RPC requirements
- [ ] Deploy `MockUSDC`
- [ ] Deploy `HyperVault`
- [ ] Configure engine manager wallet
- [ ] Configure web with testnet contract addresses
- [ ] Run a complete testnet user flow:
  - deposit mock collateral
  - open leveraged position
  - move mark price or simulate adverse move
  - trigger close or liquidation
  - settle on-chain
  - withdraw remaining balance

Exit criteria:

- MVP works on testnet end to end with real contract interactions

### 10.3 MVP hardening

- [ ] Add error monitoring hooks
- [ ] Add healthcheck endpoints
- [ ] Add reconciliation script for vault balance vs database state
- [ ] Add runbook notes for settlement failure and hedge failure

Exit criteria:

- the MVP is operable enough to demo repeatedly without manual guesswork

## Definition of Done

Hypermarket MVP is done when all of the following are true:

- a user can connect wallet and deposit collateral on testnet
- the engine can open and manage a virtual leveraged position on an allowed Polymarket market
- the UI shows real-time mark price, PnL, and liquidation price
- the engine can close or liquidate the position based on risk rules
- realized PnL is settled back to `HyperVault`
- the user can withdraw the final settled balance on testnet
