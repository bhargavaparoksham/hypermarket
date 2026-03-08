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
  polymarketMarketAllowlist: string[];
  marketDiscoveryCacheTtlMs: number;
  polygonRpcUrl: string;
  vaultManagerPrivateKey: string;
  hyperVaultAddress: string;
}

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}
