import { createRuntime } from "./runtime.js";

const { config, logger } = createRuntime();

logger.info("Booting engine worker", {
  redisUrl: config.redisUrl,
  databaseUrlConfigured: Boolean(config.databaseUrl)
});

setInterval(() => {
  logger.debug("Worker heartbeat", {
    mode: "worker"
  });
}, 30_000);
