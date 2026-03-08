import { startHttpServer } from "./http.js";
import { createRuntime } from "./runtime.js";
import { createMarketDiscoveryService } from "./markets/market-service.js";
import { createPolymarketClient } from "./markets/polymarket-client.js";

const { config, logger } = createRuntime();
const marketDiscoveryService = createMarketDiscoveryService({
  allowlist: config.polymarketMarketAllowlist,
  cacheTtlMs: config.marketDiscoveryCacheTtlMs,
  client: createPolymarketClient({
    apiUrl: config.polymarketApiUrl,
    logger
  }),
  logger
});

logger.info("Booting engine API", {
  port: config.port,
  host: config.host,
  allowlistedMarkets: config.polymarketMarketAllowlist.length
});

startHttpServer(
  { ...config, mode: "api" },
  logger,
  { marketDiscoveryService }
);
