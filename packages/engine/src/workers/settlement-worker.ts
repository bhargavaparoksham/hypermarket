import { Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import { Logger } from "../logger.js";
import { createWorkerOptions, QUEUE_NAMES } from "../queues/index.js";
import { SettlementJobData } from "../queues/types.js";
import { SettlementService } from "../services/settlement-service.js";

async function processSettlementJob(
  job: Job<SettlementJobData>,
  settlementService: SettlementService,
  logger: Logger
): Promise<void> {
  await settlementService.processSettlement(job.data.settlementId);
  logger.info("Processing settlement job", {
    jobId: job.id,
    settlementId: job.data.settlementId,
    userId: job.data.userId,
    amount: job.data.amount,
    pnl: job.data.pnl
  });
}

export function startSettlementWorker(
  connection: Redis,
  settlementService: SettlementService,
  logger: Logger
): Worker<SettlementJobData> {
  const worker = new Worker<SettlementJobData>(
    QUEUE_NAMES.settlement,
    async (job) => {
      await processSettlementJob(job, settlementService, logger);
    },
    createWorkerOptions(connection, logger)
  );

  worker.on("completed", (job) => {
    logger.info("Settlement job completed", {
      jobId: job.id,
      settlementId: job.data.settlementId
    });
  });

  worker.on("failed", (job, error) => {
    logger.error("Settlement job failed", {
      jobId: job?.id,
      settlementId: job?.data.settlementId,
      error: error.message
    });
  });

  return worker;
}
