import { CONTRACT_ADDRESSES } from "./addresses.js";
import { DEFAULT_CHAIN_ID } from "./constants.js";
import { hyperVaultAbi } from "./abi/hyperVault.js";

export const contracts = {
  hyperVault: {
    abi: hyperVaultAbi,
    addresses: CONTRACT_ADDRESSES,
    defaultChainId: DEFAULT_CHAIN_ID
  }
} as const;
