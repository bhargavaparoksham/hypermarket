# @hypermarket/contracts

Foundry package for Hypermarket settlement contracts.

## Contracts

- `src/HyperVault.sol`: on-chain custody and settlement contract for deposits, withdrawals, and manager-driven realized PnL settlement
- `src/mocks/MockUSDC.sol`: 6-decimal mock collateral token for local and testnet MVP flows, built on OpenZeppelin ERC20

## Layout

- `src/`: deployable product contracts
- `src/mocks/`: local and testnet support contracts
- `script/`: Foundry deployment scripts
- `script/utils/`: script-only helpers
- `test/`: contract tests

## Local Commands

```sh
pnpm --filter @hypermarket/contracts build
pnpm --filter @hypermarket/contracts test
pnpm --filter @hypermarket/contracts lint
```

## Testnet Target

Current default target: Polygon Amoy (`chainId 80002`)

## Environment

Copy values into `packages/contracts/.env`:

```sh
PRIVATE_KEY=
POLYGON_AMOY_RPC_URL=
POLYGONSCAN_API_KEY=
USDC_ADDRESS=
OWNER_ADDRESS=
MANAGER_ADDRESS=
```

`USDC_ADDRESS` can be left empty if you deploy `MockUSDC` first and then use its address for `HyperVault`.

## Deploy Flow

1. Deploy `MockUSDC`
2. Fund test wallets with mock collateral
3. Deploy `HyperVault` with:
   - collateral token address
   - owner address
   - manager address
4. Copy deployed addresses into the shared package config before wiring engine and web

Deployment records should be stored in:

- `packages/contracts/deployments/amoy.example.json` as the shape reference
- `packages/shared/src/addresses.ts` for app consumption

## Example Commands

Deploy mock collateral:

```sh
forge script script/DeployMockUSDC.s.sol:DeployMockUSDC \
  --rpc-url "$POLYGON_AMOY_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

Deploy vault:

```sh
forge script script/DeployHyperVault.s.sol:DeployHyperVault \
  --sig "run(address,address,address)" "$USDC_ADDRESS" "$OWNER_ADDRESS" "$MANAGER_ADDRESS" \
  --rpc-url "$POLYGON_AMOY_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

Optional verification can be added once the deployment flow is stable.
