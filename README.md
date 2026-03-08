# Hypermarket

Hypermarket is Hyperliquid for Polymarket.

The goal is simple:

- Users deposit USDC once
- open leveraged long or short exposure on Polymarket markets
- update PnL in real time without waiting for block confirmations
- settle realized PnL back to an on-chain vault when positions close or are liquidated

This is not a pure on-chain perp. The core design is a high-frequency off-chain engine with on-chain settlement.

## Why This Architecture

Polymarket itself is not designed for a user to open and close leveraged positions every few seconds directly on-chain. Doing every user action as an on-chain trade would be too slow, too expensive, and too fragile for a trading terminal.

Hypermarket therefore splits the system into two layers:

- `Settlement Layer`: holds user collateral and final settled balances on-chain
- `Execution Layer`: computes positions, margin, mark prices, funding later, and liquidations off-chain

That gives Hypermarket the right UX shape:

- sub-second UI updates
- gasless or near-gasless trade intent submission
- batched hedging on Polymarket
- minimal on-chain writes

## Scope

The first version should support:

- USDC deposits into a vault on Polygon PoS
- isolated-margin or simple cross-margin accounts backed by vault collateral
- up to `10x` leverage
- long and short virtual positions on selected Polymarket markets
- real-time mark price updates from Polymarket market data
- liquidation checks with a safety buffer
- backend-managed hedging when aggregate exposure breaches risk thresholds
- on-chain settlement of realized PnL after close or liquidation

The MVP should explicitly avoid:

- fully decentralized matching
- user-to-user order matching
- advanced funding-rate logic
- portfolio margin
- permissionless liquidation bots
- multi-chain support

## Monorepo Layout

```text
/hypermarket
  /packages
    /contracts   # Foundry project: HyperVault, mock tokens, deployment scripts
    /engine      # Node.js services: price ingestion, risk, hedging, liquidation
    /web         # Next.js app: trading terminal, portfolio, deposit/withdraw flows
    /shared      # Shared types, ABIs, market schemas, constants
```

Recommended workspace tooling:

- `pnpm` workspaces
- TypeScript for all JS packages
- Foundry for Solidity
- Prisma + PostgreSQL for state
- Redis for ephemeral market state and queues
- BullMQ for scheduled and retryable jobs

Initial package responsibilities:

- `packages/contracts`: vault contract, mocks, tests, and deployment scripts
- `packages/engine`: API server, market ingestion, risk engine, liquidation workers, settlement bridge
- `packages/web`: trading terminal, wallet flows, account views, and real-time UI
- `packages/shared`: shared types, constants, ABI exports, and config used by all packages

## System Overview

```text
Polymarket CLOB/WebSocket
        |
        v
  Price Ingestion Service
        |
        v
   Redis Mark Prices <----------------------+
        |                                   |
        v                                   |
  Risk + Margin Engine                      |
        |                                   |
        v                                   |
 PostgreSQL Position Ledger                 |
        |                                   |
        +--> Liquidation Worker --------+   |
        |                               |   |
        +--> Exposure Manager           |   |
                 |                      |   |
                 v                      |   |
         Polymarket Hedge Executor      |   |
                                        |   |
User Wallet -> HyperVault.sol <---------+---+
                ^
                |
         Settlement Service
```

## Core Components

### 1. `packages/contracts`

This package contains the on-chain settlement layer.

Primary contract: `HyperVault.sol`

Responsibilities:

- accept USDC deposits
- track settled balances per user
- allow authorized backend manager to apply realized PnL
- process withdrawals against settled balance
- emit events that make the off-chain ledger auditable

The contract should stay intentionally narrow. It should not attempt to price markets, compute maintenance margin, or run a matching engine.

Core functions for MVP:

- `deposit(uint256 amount)`
- `withdraw(uint256 amount)`
- `settle(address user, int256 pnl)`
- `setManager(address manager)`

Suggested state:

- `mapping(address => uint256) settledBalance`
- `IERC20 usdc`
- `address manager`
- optional pause and admin controls

Behavior:

- `deposit()` transfers USDC into the vault and credits settled balance
- `settle()` can increase or decrease settled balance based on realized PnL
- `withdraw()` lets users withdraw up to their currently settled amount

Important constraint:

- open position margin and unrealized PnL live off-chain in the engine
- only realized outcomes hit the vault

That separation keeps the contract simple and cheap.

### 2. `packages/engine`

This is the core of Hypermarket. It is where the product actually feels fast.

Subcomponents:

- `price-service`
- `position-service`
- `risk-service`
- `liquidation-worker`
- `hedge-worker`
- `settlement-service`
- optional `api` layer for the web app

#### Price Service

Consumes Polymarket CLOB market data and maintains:

- best bid/ask
- midpoint
- last trade
- timestamped mark price

For MVP, the mark price can be based on midpoint with guardrails:

- fallback to last trade if book depth is thin
- reject stale prices
- clamp jumps above a configured threshold unless confirmed by multiple updates

Redis is the right fit for this path because prices are hot data and need low-latency reads.

#### Position Service

Stores each user’s virtual positions in PostgreSQL.

Suggested position fields:

- `userId`
- `marketId`
- `side`
- `size`
- `notional`
- `entryPrice`
- `markPrice`
- `leverage`
- `initialMargin`
- `maintenanceMargin`
- `unrealizedPnl`
- `liquidationPrice`
- `status`

This service handles:

- open position requests
- reduce/close position requests
- average entry calculations
- realized PnL on close

#### Risk Service

Computes account health in real time.

Core formulas for MVP:

- `positionNotional = size * markPrice`
- `initialMargin = positionNotional / leverage`
- `unrealizedPnl` based on side and price delta
- `equity = settledBalance + unrealizedPnl - fees`
- `maintenanceMargin = positionNotional * mmr`

A position becomes liquidatable when:

- `equity <= maintenanceMargin + liquidationBuffer`

For the example you gave:

- 10x long at `0.50`
- raw bankruptcy move is about `10%` down
- liquidation should trigger before that, for example near `0.455`, leaving a safety buffer for slippage and fees

The exact threshold should be configurable, not hardcoded in UI logic.

#### Liquidation Worker

Runs continuously and checks open positions against mark prices.

Responsibilities:

- identify liquidatable accounts
- freeze further trading on those accounts
- reduce or close positions internally
- realize losses
- send settlement delta to the vault

BullMQ is useful here for:

- retrying failed liquidation jobs
- rate-limiting bursts
- isolating expensive tasks

#### Exposure Manager and Hedge Worker

Users trade against Hypermarket’s internal virtual book, not directly against Polymarket every time.

The engine periodically computes net exposure:

- by market
- by outcome
- by direction

When net risk exceeds thresholds, the hedge worker places offsetting orders on Polymarket.

This is one of the most important architectural choices in the MVP:

- user trades are instant and internal
- external hedge execution is batched and risk-aware

That is how Hypermarket gets closer to a CEX-like trading feel.

#### Settlement Service

This service is the bridge between off-chain state and `HyperVault.sol`.

Responsibilities:

- call `settle(user, pnl)` when positions close or liquidate
- keep an idempotent record of settlement jobs
- reconcile on-chain events back into PostgreSQL

This path must be extremely conservative:

- no duplicate settlements
- explicit transaction status tracking
- replay-safe processing

### 3. `packages/web`

This is the trading terminal.

Stack:

- Next.js App Router
- Tailwind CSS
- `wagmi`
- `viem`

Primary screens:

- markets list
- market trading panel
- portfolio / positions
- deposit / withdraw flows

Core UI modules:

- `Live Markets` sidebar fed by engine API
- central chart and order ticket
- leverage slider from `1x` to `10x`
- position table with:
  - size
  - entry price
  - mark price
  - liquidation price
  - unrealized PnL
- account summary:
  - settled balance
  - used margin
  - free collateral
  - margin ratio

UX principle for MVP:

- wallet interactions only for deposit and withdraw
- trade placement should feel instant and not depend on block inclusion

### 4. `packages/shared`

This package exists to stop contracts, engine, and web from drifting apart.

Suggested contents:

- vault ABI
- chain constants
- market and position types
- enum definitions
- fee and leverage constants
- shared validation schemas

## Trade Lifecycle

### Open Position

1. User deposits USDC into `HyperVault.sol`.
2. The web app reads the user’s settled balance and engine account state.
3. User submits a long or short trade with leverage.
4. The engine validates collateral, pricing, and risk limits.
5. The engine records a virtual position in PostgreSQL.
6. The UI updates immediately from engine state.
7. If aggregate exposure breaches thresholds, the hedge worker executes on Polymarket.

### Close Position

1. User closes all or part of a position in the UI.
2. The engine computes realized PnL using exit mark or execution logic.
3. The position ledger is updated.
4. The settlement service calls `settle(user, pnl)` on the vault.
5. The user’s settled balance becomes withdrawable on-chain.

### Liquidation

1. Price service updates mark price.
2. Risk service detects maintenance margin breach.
3. Liquidation worker closes or force-reduces the position.
4. Loss is realized and fees are applied.
5. Settlement service updates the vault.
6. Any remaining settled balance stays withdrawable by the user.

## Data Model

At minimum, PostgreSQL should have:

- `users`
- `margin_accounts`
- `positions`
- `fills`
- `settlements`
- `liquidations`
- `hedge_orders`
- `market_snapshots`

Recommended split of responsibility:

- PostgreSQL: source of truth for business state
- Redis: hot cache, mark prices, ephemeral queue coordination
- On-chain vault: source of truth for custody and settled withdrawals

## Pricing and Risk Assumptions

The MVP should keep risk logic intentionally conservative.

Recommended initial constraints:

- max leverage: `10x`
- allowlist a small set of liquid Polymarket markets
- cap max position size per market
- cap max user notional
- use spread-aware mark prices
- stale price cutoff for order acceptance
- liquidation fee to cover execution risk
- pause trading if Polymarket data feed becomes unavailable

Important design note:

Prediction market prices are bounded between `0` and `1`, which is different from standard perpetuals. Risk logic must respect this bounded price range when computing shorts, max loss, and liquidation thresholds.

## Smart Contract Design Notes

The vault should remain simple enough to audit quickly.

Suggested non-MVP but likely useful additions:

- `Ownable` or `AccessControl`
- pausability
- per-user nonces for administrative accounting actions if needed
- emergency withdrawal procedures
- manager rotation

Things the contract should not do:

- talk directly to Polymarket
- maintain open position data
- calculate liquidation thresholds
- run price oracles

## API Surface for MVP

The engine should expose a small internal API for the web app.

Example endpoints:

- `GET /markets`
- `GET /markets/:marketId`
- `GET /accounts/:address`
- `GET /positions/:address`
- `POST /trade`
- `POST /close`
- `POST /withdraw/prepare`

Later, this can be moved to WebSockets for streaming:

- price updates
- position updates
- liquidation notices
- account health metrics

## Security Model

The main trust assumption in the MVP is clear:

- user funds are on-chain in the vault
- trade execution, margining, and settlement timing are backend-managed

That means the critical risks are:

- incorrect PnL settlement
- incorrect liquidation logic
- compromised manager key
- divergence between off-chain ledger and on-chain balances

Mitigations for MVP:

- narrow vault permissions
- event-driven reconciliation
- idempotent settlement jobs
- signed admin actions
- audit logs for every position state transition
- conservative leverage and market limits

## Build Order

Recommended implementation sequence:

1. bootstrap `pnpm` monorepo and package layout
2. implement `HyperVault.sol` with tests in Foundry
3. define shared types and vault ABI package
4. build engine price ingestion from Polymarket
5. build position + risk + liquidation logic
6. add PostgreSQL + Prisma models
7. expose engine API for trading and account reads
8. build Next.js terminal UI
9. add hedge execution against Polymarket
10. harden reconciliation, auth, observability, and failure recovery

## What “MVP” Means Here

A successful MVP is not full protocol decentralization. It is a working internal trading system that proves:

- users want leveraged exposure to Polymarket outcomes
- the UX can feel instant
- backend-managed risk and hedging are operationally viable
- on-chain settlement is enough to build trust at the first stage

## Next Steps

Immediate next artifacts to generate from this README:

- root `package.json` with `pnpm` workspaces
- `packages/contracts` Foundry project
- `HyperVault.sol`
- `packages/shared` TypeScript package for ABI and types
- `packages/engine` skeleton with price and liquidation services
- `packages/web` Next.js app shell

If this architecture changes later, the most likely evolution is:

- gasless trading via EIP-712 signed intents
- WebSocket-first streaming
- cross-margin across multiple active markets
- smarter hedging and inventory management
- eventually, more decentralized risk or execution components
