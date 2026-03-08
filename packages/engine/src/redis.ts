import { Redis } from "ioredis";
import { Logger } from "./logger.js";

export function createRedisConnection(redisUrl: string, logger: Logger): Redis {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });

  redis.on("connect", () => {
    logger.info("Redis connected");
  });

  redis.on("error", (error: Error) => {
    logger.error("Redis error", {
      error: error.message
    });
  });

  redis.on("close", () => {
    logger.warn("Redis connection closed");
  });

  return redis;
}
