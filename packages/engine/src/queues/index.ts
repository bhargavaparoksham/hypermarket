import { JobsOptions, Queue, WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import { Logger } from "../logger.js";
import { LiquidationJobData, SettlementJobData } from "./types.js";

export const QUEUE_NAMES = {
  liquidation: "liquidation",
  settlement: "settlement"
} as const;

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  removeOnComplete: 1000,
  removeOnFail: 1000,
  backoff: {
    type: "exponential",
    delay: 1000
  }
};

export function createLiquidationQueue(connection: Redis) {
  return new Queue(QUEUE_NAMES.liquidation, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  });
}

export function createSettlementQueue(connection: Redis) {
  return new Queue(QUEUE_NAMES.settlement, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  });
}

export function createWorkerOptions(connection: Redis, logger: Logger): WorkerOptions {
  return {
    connection,
    concurrency: 10,
    autorun: true,
    settings: {
      backoffStrategy(attemptsMade: number) {
        const delay = Math.min(30_000, 1_000 * 2 ** attemptsMade);
        logger.debug("Applying worker backoff", {
          attemptsMade,
          delay
        });
        return delay;
      }
    }
  };
}
