import { createRuntime } from "./runtime.js";
import { bootstrapQueues } from "./bootstrap/queues.js";
import { createRedisConnection } from "./redis.js";
import { startLiquidationWorker } from "./workers/liquidation-worker.js";
import { startSettlementWorker } from "./workers/settlement-worker.js";
import { createMarketDiscoveryService } from "./markets/market-service.js";
import { createPolymarketClient } from "./markets/polymarket-client.js";
import { createRedisMarketPriceStore } from "./prices/price-store.js";
import { createPolymarketPriceFeed } from "./prices/polymarket-price-feed.js";
import { createPrismaClient } from "./prisma.js";
import { createHyperVaultChainClient } from "./services/hypervault-client.js";
import { createExposureService } from "./services/exposure-service.js";
import { createHedgeExecutionService } from "./services/hedge-execution-service.js";
import { createPolymarketHedgeClient } from "./services/polymarket-hedge-client.js";
import { createSettlementService } from "./services/settlement-service.js";
import { startHedgeExecutionLoop } from "./workers/hedge-worker.js";

const { config, logger } = createRuntime();

logger.info("Booting engine worker", {
  redisUrl: config.redisUrl,
  databaseUrlConfigured: Boolean(config.databaseUrl)
});

const redis = createRedisConnection(config.redisUrl, logger);
const prisma = createPrismaClient();
const chainClient = createHyperVaultChainClient(config);
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
const queues = bootstrapQueues(redis, logger);
const settlementService = createSettlementService(
  prisma,
  queues.settlementQueue,
  chainClient,
  logger
);
const hedgeExecutionService = createHedgeExecutionService(
  prisma,
  createPolymarketHedgeClient({
    executionUrl: config.polymarketHedgeProxyUrl,
    apiKey: config.polymarketHedgeApiKey,
    dryRun: config.polymarketHedgeDryRun,
    logger
  }),
  {
    defaultThresholds: {
      minNetNotional: String(config.hedgeMinNetNotional),
      minImbalanceRatio: String(config.hedgeMinImbalanceRatio),
      maxHedgeNotional:
        config.hedgeMaxOrderNotional === null
          ? null
          : String(config.hedgeMaxOrderNotional)
    }
  }
);
startLiquidationWorker(redis, logger);
startSettlementWorker(redis, settlementService, logger);
startHedgeExecutionLoop({
  exposureService: createExposureService(prisma),
  hedgeExecutionService,
  intervalMs: config.hedgeExecutionIntervalMs,
  logger
});

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
  void settlementService
    .reconcileSubmittedSettlements()
    .then((result) => {
      if (result.processed > 0) {
        logger.info("Reconciled submitted settlements", result);
      }
    })
    .catch((error: unknown) => {
      logger.error("Submitted settlement reconciliation loop failed", {
        error:
          error instanceof Error ? error.message : "Unknown reconciliation error"
      });
    });
}, config.settlementReconcileIntervalMs);

setInterval(() => {
  void settlementService
    .syncAllWallets()
    .then((result) => {
      logger.debug("Vault sync poll completed", result);
    })
    .catch((error: unknown) => {
      logger.error("Vault sync poll failed", {
        error: error instanceof Error ? error.message : "Unknown vault sync error"
      });
    });
}, config.vaultSyncIntervalMs);

setInterval(() => {
  logger.debug("Worker heartbeat", {
    mode: "worker"
  });
}, 30_000);
