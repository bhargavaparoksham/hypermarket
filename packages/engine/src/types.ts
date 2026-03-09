export type EngineMode = "api" | "worker";

export interface EngineConfig {
  host: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  mode: EngineMode;
  databaseUrl: string;
  redisUrl: string;
  polymarketApiUrl: string;
  polymarketWsUrl: string;
  polymarketHedgeProxyUrl: string | null;
  polymarketHedgeApiKey: string | null;
  polymarketHedgeDryRun: boolean;
  polymarketMarketAllowlist: string[];
  marketDiscoveryCacheTtlMs: number;
  hedgeExecutionIntervalMs: number;
  hedgeMinNetNotional: number;
  hedgeMinImbalanceRatio: number;
  hedgeMaxOrderNotional: number | null;
  polygonRpcUrl: string;
  vaultManagerPrivateKey: string;
  hyperVaultAddress: string;
  settlementReconcileIntervalMs: number;
  vaultSyncIntervalMs: number;
}

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}
