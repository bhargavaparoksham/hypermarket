import { createRuntime } from "./runtime.js";
import { bootstrapQueues } from "./bootstrap/queues.js";
import { createRedisConnection } from "./redis.js";
import { startLiquidationWorker } from "./workers/liquidation-worker.js";
import { startSettlementWorker } from "./workers/settlement-worker.js";

const { config, logger } = createRuntime();

logger.info("Booting engine worker", {
  redisUrl: config.redisUrl,
  databaseUrlConfigured: Boolean(config.databaseUrl)
});

const redis = createRedisConnection(config.redisUrl, logger);
bootstrapQueues(redis, logger);
startLiquidationWorker(redis, logger);
startSettlementWorker(redis, logger);

setInterval(() => {
  logger.debug("Worker heartbeat", {
    mode: "worker"
  });
}, 30_000);
