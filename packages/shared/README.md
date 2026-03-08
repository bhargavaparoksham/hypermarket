# @hypermarket/shared

This package contains the shared types, constants, and contract metadata used by `contracts`, `engine`, and `web`.

## ABI Sync

For now, `HyperVault` ABI is maintained as a placeholder TypeScript export in `src/abi/hyperVault.ts`.

Once Foundry artifacts exist, the sync flow should be:

1. compile contracts in `packages/contracts`
2. export the production ABI from the generated artifact
3. replace or generate the ABI file in `packages/shared/src/abi`
4. update deployed addresses in `src/constants.ts`

The import path for consumers should remain stable:

- `@hypermarket/shared` for shared exports
- `contracts.hyperVault.abi` for the vault ABI
- `contracts.hyperVault.addresses` for chain-specific addresses
