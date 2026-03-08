import { createRuntime } from "./runtime.js";
import { bootstrapQueues } from "./bootstrap/queues.js";
import { createRedisConnection } from "./redis.js";
import { startLiquidationWorker } from "./workers/liquidation-worker.js";
import { startSettlementWorker } from "./workers/settlement-worker.js";
import { createMarketDiscoveryService } from "./markets/market-service.js";
import { createPolymarketClient } from "./markets/polymarket-client.js";
import { createRedisMarketPriceStore } from "./prices/price-store.js";
import { createPolymarketPriceFeed } from "./prices/polymarket-price-feed.js";

const { config, logger } = createRuntime();

logger.info("Booting engine worker", {
  redisUrl: config.redisUrl,
  databaseUrlConfigured: Boolean(config.databaseUrl)
});

const redis = createRedisConnection(config.redisUrl, logger);
const marketPriceStore = createRedisMarketPriceStore(redis);
const marketDiscoveryService = createMarketDiscoveryService({
  allowlist: config.polymarketMarketAllowlist,
  cacheTtlMs: config.marketDiscoveryCacheTtlMs,
  client: createPolymarketClient({
    apiUrl: config.polymarketApiUrl,
    logger
  }),
  logger
});
bootstrapQueues(redis, logger);
startLiquidationWorker(redis, logger);
startSettlementWorker(redis, logger);

void marketDiscoveryService
  .listMarkets()
  .then((markets) => {
    const priceFeed = createPolymarketPriceFeed({
      logger,
      marketPriceStore,
      markets,
      wsUrl: config.polymarketWsUrl
    });

    priceFeed.start();
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown market discovery error";
    logger.error("Failed to bootstrap price feed", {
      error: message
    });
  });

setInterval(() => {
  logger.debug("Worker heartbeat", {
    mode: "worker"
  });
}, 30_000);
