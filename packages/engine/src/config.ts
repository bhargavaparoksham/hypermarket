import { EngineConfig, EngineMode } from "./types.js";

const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);
const ENGINE_MODES = new Set<EngineMode>(["api", "worker"]);

function getRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

function parseLogLevel(value: string): EngineConfig["logLevel"] {
  if (!LOG_LEVELS.has(value)) {
    throw new Error(`Invalid LOG_LEVEL value: ${value}`);
  }

  return value as EngineConfig["logLevel"];
}

function parseMode(value: string): EngineMode {
  if (!ENGINE_MODES.has(value as EngineMode)) {
    throw new Error(`Invalid ENGINE_MODE value: ${value}`);
  }

  return value as EngineMode;
}

function parseAddress(name: string, value: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid ${name} address: ${value}`);
  }

  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  return {
    host: env.HOST || "0.0.0.0",
    port: parsePort(env.PORT || "4000"),
    logLevel: parseLogLevel(env.LOG_LEVEL || "info"),
    mode: parseMode(env.ENGINE_MODE || "api"),
    databaseUrl: env.DATABASE_URL || getRequiredEnv(env, "DATABASE_URL"),
    redisUrl: env.REDIS_URL || getRequiredEnv(env, "REDIS_URL"),
    polymarketApiUrl:
      env.POLYMARKET_API_URL || getRequiredEnv(env, "POLYMARKET_API_URL"),
    polymarketWsUrl:
      env.POLYMARKET_WS_URL || getRequiredEnv(env, "POLYMARKET_WS_URL"),
    polygonRpcUrl: env.POLYGON_RPC_URL || getRequiredEnv(env, "POLYGON_RPC_URL"),
    vaultManagerPrivateKey:
      env.VAULT_MANAGER_PRIVATE_KEY ||
      getRequiredEnv(env, "VAULT_MANAGER_PRIVATE_KEY"),
    hyperVaultAddress: parseAddress(
      "HYPERVAULT_ADDRESS",
      env.HYPERVAULT_ADDRESS || getRequiredEnv(env, "HYPERVAULT_ADDRESS")
    )
  };
}
