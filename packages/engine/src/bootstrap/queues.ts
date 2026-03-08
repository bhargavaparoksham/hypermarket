import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { Logger } from "../logger.js";
import {
  createLiquidationQueue,
  createSettlementQueue
} from "../queues/index.js";
import { LiquidationJobData, SettlementJobData } from "../queues/types.js";

export interface QueueClients {
  liquidationQueue: Queue<LiquidationJobData>;
  settlementQueue: Queue<SettlementJobData>;
}

export function bootstrapQueues(connection: Redis, logger: Logger): QueueClients {
  const liquidationQueue = createLiquidationQueue(connection);
  const settlementQueue = createSettlementQueue(connection);

  logger.info("BullMQ queues initialized", {
    queues: "liquidation,settlement"
  });

  return {
    liquidationQueue,
    settlementQueue
  };
}
