import { SUPPORTED_CHAIN_IDS } from "./constants.js";
import type { Address } from "./types.js";

export interface ContractAddresses {
  hyperVault: Address;
  collateralToken: Address;
}

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [SUPPORTED_CHAIN_IDS.polygonAmoy]: {
    hyperVault: "0x083eC21aE12676f7C6B78124bc718F221959f159",
    collateralToken: "0x1d0dfea85F75792D31eBf60269364eC174Cf64FB"
  }
};
