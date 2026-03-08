export const APP_NAME = "Hypermarket";

export const SUPPORTED_CHAIN_IDS = {
  polygonAmoy: 80002
} as const;

export const DEFAULT_CHAIN_ID = SUPPORTED_CHAIN_IDS.polygonAmoy;

export const LEVERAGE_LIMITS = {
  min: 1,
  max: 10,
  default: 3
} as const;

export const RISK_PARAMETERS = {
  maintenanceMarginRatio: 0.05,
  liquidationBufferRatio: 0.01,
  maxPositionNotional: 10_000,
  maxAccountNotional: 25_000,
  stalePriceThresholdMs: 15_000
} as const;

export const CONTRACT_ADDRESSES = {
  [SUPPORTED_CHAIN_IDS.polygonAmoy]: {
    hyperVault: "0x0000000000000000000000000000000000000000",
    collateralToken: "0x0000000000000000000000000000000000000000"
  }
} as const;
