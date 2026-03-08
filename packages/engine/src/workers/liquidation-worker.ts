import { Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import { Logger } from "../logger.js";
import { createWorkerOptions, QUEUE_NAMES } from "../queues/index.js";
import { LiquidationJobData } from "../queues/types.js";

async function processLiquidationJob(
  job: Job<LiquidationJobData>,
  logger: Logger
): Promise<void> {
  logger.info("Processing liquidation job", {
    jobId: job.id,
    liquidationId: job.data.liquidationId,
    userId: job.data.userId,
    positionId: job.data.positionId,
    marketId: job.data.marketId
  });
}

export function startLiquidationWorker(connection: Redis, logger: Logger): Worker<LiquidationJobData> {
  const worker = new Worker<LiquidationJobData>(
    QUEUE_NAMES.liquidation,
    async (job) => {
      await processLiquidationJob(job, logger);
    },
    createWorkerOptions(connection, logger)
  );

  worker.on("completed", (job) => {
    logger.info("Liquidation job completed", {
      jobId: job.id,
      liquidationId: job.data.liquidationId
    });
  });

  worker.on("failed", (job, error) => {
    logger.error("Liquidation job failed", {
      jobId: job?.id,
      liquidationId: job?.data.liquidationId,
      error: error.message
    });
  });

  return worker;
}
