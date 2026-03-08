import { DEFAULT_CHAIN_ID, CONTRACT_ADDRESSES } from "./constants.js";
import { hyperVaultAbi } from "./abi/hyperVault.js";

export const contracts = {
  hyperVault: {
    abi: hyperVaultAbi,
    addresses: CONTRACT_ADDRESSES,
    defaultChainId: DEFAULT_CHAIN_ID
  }
} as const;
