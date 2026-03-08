import { Decimal } from "@prisma/client/runtime/library";
import type { Hex } from "viem";
import { Logger } from "../logger.js";
import { DECIMAL_ZERO, toDecimal } from "./decimal.js";
import type {
  HyperVaultChainClient,
  SettlementReceipt
} from "./hypervault-client.js";
import {
  createVaultSyncService,
  type VaultSyncPrismaLike
} from "./vault-sync-service.js";

type SettlementStatus = "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";
type SettlementDirection = "CREDIT" | "DEBIT";

interface SettlementRecord {
  id: string;
  userId: string;
  positionId: string | null;
  amount: Decimal;
  pnl: Decimal;
  status: SettlementStatus;
  direction: string;
  transactionHash: string | null;
  errorMessage: string | null;
}

interface UserRecord {
  id: string;
  walletAddress: string;
}

interface UserDelegate {
  upsert(args: {
    where: { walletAddress: string };
    create: { walletAddress: string };
    update: Record<string, never>;
  }): Promise<UserRecord>;
  findUnique(args: {
    where: { id?: string; walletAddress?: string };
  }): Promise<UserRecord | null>;
  findMany(args?: {
    select?: { walletAddress: true };
  }): Promise<Array<{ walletAddress: string }>>;
}

interface SettlementDelegate {
  findUnique(args: { where: { id: string } }): Promise<SettlementRecord | null>;
  findFirst(args: {
    where: {
      positionId?: string;
      status?: { in: readonly string[] };
    };
  }): Promise<SettlementRecord | null>;
  findMany(args: {
    where: {
      status: { in: readonly string[] };
    };
    take?: number;
  }): Promise<SettlementRecord[]>;
  create(args: {
    data: {
      userId: string;
      positionId?: string;
      amount: Decimal;
      pnl: Decimal;
      status: SettlementStatus;
      direction: SettlementDirection;
    };
  }): Promise<SettlementRecord>;
  update(args: {
    where: { id: string };
    data: {
      status?: SettlementStatus;
      transactionHash?: string | null;
      errorMessage?: string | null;
    };
  }): Promise<SettlementRecord>;
}

export interface SettlementQueueLike {
  add(
    name: string,
    data: {
      settlementId: string;
      userId: string;
      amount: number;
      pnl: number;
    }
  ): Promise<unknown>;
}

export interface SettlementPrismaLike extends VaultSyncPrismaLike {
  user: UserDelegate;
  settlement: SettlementDelegate;
}

export interface CreateSettlementInput {
  userId: string;
  positionId?: string;
  pnl: Decimal | number | string;
}

export interface SettlementService {
  createSettlement(input: CreateSettlementInput): Promise<{
    settlementId: string;
    deduplicated: boolean;
  }>;
  processSettlement(settlementId: string): Promise<void>;
  reconcileSubmittedSettlements(limit?: number): Promise<{
    processed: number;
    confirmed: number;
    failed: number;
    pending: number;
  }>;
  syncAllWallets(): Promise<{ synced: number }>;
}

const DEDUPE_STATUSES = ["PENDING", "SUBMITTED", "CONFIRMED"] as const;
const SUBMITTED_STATUS = ["SUBMITTED"] as const;
const COLLATERAL_DECIMALS = 6;

function settlementDirectionForPnl(pnl: Decimal): SettlementDirection {
  return pnl.greaterThanOrEqualTo(DECIMAL_ZERO) ? "CREDIT" : "DEBIT";
}

function settlementAmountForPnl(pnl: Decimal): Decimal {
  return pnl.abs();
}

function decimalToContractUnits(value: Decimal): bigint {
  const normalized = value.toFixed(COLLATERAL_DECIMALS);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const paddedFraction = fraction.padEnd(COLLATERAL_DECIMALS, "0");
  const units = BigInt(`${whole}${paddedFraction}`);

  return negative ? -units : units;
}

function receiptMatchesSettlement(
  receipt: SettlementReceipt,
  walletAddress: string,
  expectedPnl: Decimal
): boolean {
  if (!receipt.settledEvent) {
    return false;
  }

  return (
    receipt.settledEvent.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
    receipt.settledEvent.pnl === decimalToContractUnits(expectedPnl)
  );
}

export async function queueSettlementRequest(
  prisma: SettlementPrismaLike,
  settlementQueue: SettlementQueueLike,
  input: CreateSettlementInput
): Promise<{
  settlementId: string;
  deduplicated: boolean;
}> {
  const pnl = toDecimal(input.pnl);
  if (pnl.equals(DECIMAL_ZERO)) {
    return {
      settlementId: "",
      deduplicated: true
    };
  }

  if (input.positionId) {
    const existing = await prisma.settlement.findFirst({
      where: {
        positionId: input.positionId,
        status: {
          in: [...DEDUPE_STATUSES]
        }
      }
    });

    if (existing) {
      return {
        settlementId: existing.id,
        deduplicated: true
      };
    }
  }

  const settlement = await prisma.settlement.create({
    data: {
      userId: input.userId,
      positionId: input.positionId,
      amount: settlementAmountForPnl(pnl),
      pnl,
      status: "PENDING",
      direction: settlementDirectionForPnl(pnl)
    }
  });

  await settlementQueue.add("settlement", {
    settlementId: settlement.id,
    userId: settlement.userId,
    amount: Number(settlement.amount.toString()),
    pnl: Number(settlement.pnl.toString())
  });

  return {
    settlementId: settlement.id,
    deduplicated: false
  };
}

export function createSettlementService(
  prisma: SettlementPrismaLike,
  settlementQueue: SettlementQueueLike,
  chainClient: HyperVaultChainClient,
  logger: Logger
): SettlementService {
  const vaultSyncService = createVaultSyncService(prisma, {
    readSettledBalance(walletAddress) {
      return chainClient.readSettledBalance(walletAddress);
    }
  });

  async function markSettlementFailed(
    settlementId: string,
    errorMessage: string
  ): Promise<void> {
    await prisma.settlement.update({
      where: {
        id: settlementId
      },
      data: {
        status: "FAILED",
        errorMessage
      }
    });
  }

  async function submitSettlement(settlementId: string): Promise<void> {
    const settlement = await prisma.settlement.findUnique({
      where: {
        id: settlementId
      }
    });

    if (!settlement) {
      throw new Error(`Settlement ${settlementId} not found`);
    }

    if (settlement.status !== "PENDING") {
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        id: settlement.userId
      }
    });

    if (!user) {
      throw new Error(`User ${settlement.userId} not found for settlement ${settlement.id}`);
    }

    const transactionHash = await chainClient.submitSettlement(
      user.walletAddress,
      decimalToContractUnits(settlement.pnl)
    );

    await prisma.settlement.update({
      where: {
        id: settlement.id
      },
      data: {
        status: "SUBMITTED",
        transactionHash,
        errorMessage: null
      }
    });

    logger.info("Submitted settlement transaction", {
      settlementId: settlement.id,
      userId: settlement.userId,
      transactionHash
    });
  }

  async function reconcileSettlement(
    settlementId: string
  ): Promise<"pending" | "confirmed" | "failed"> {
    const settlement = await prisma.settlement.findUnique({
      where: {
        id: settlementId
      }
    });

    if (!settlement) {
      throw new Error(`Settlement ${settlementId} not found`);
    }

    if (settlement.status === "CONFIRMED") {
      return "confirmed";
    }

    if (settlement.status !== "SUBMITTED" || !settlement.transactionHash) {
      return "pending";
    }

    const user = await prisma.user.findUnique({
      where: {
        id: settlement.userId
      }
    });

    if (!user) {
      throw new Error(`User ${settlement.userId} not found for settlement ${settlement.id}`);
    }

    const receipt = await chainClient.getSettlementReceipt(
      settlement.transactionHash as Hex
    );

    if (receipt.status === "pending") {
      return "pending";
    }

    if (
      receipt.status === "reverted" ||
      !receiptMatchesSettlement(receipt, user.walletAddress, settlement.pnl)
    ) {
      await markSettlementFailed(
        settlement.id,
        receipt.status === "reverted"
          ? "Settlement transaction reverted on-chain"
          : "Settlement receipt missing matching Settled event"
      );

      logger.error("Settlement reconciliation failed", {
        settlementId: settlement.id,
        transactionHash: settlement.transactionHash
      });

      return "failed";
    }

    await prisma.settlement.update({
      where: {
        id: settlement.id
      },
      data: {
        status: "CONFIRMED",
        errorMessage: null
      }
    });
    await vaultSyncService.syncWallet(user.walletAddress);

    logger.info("Settlement confirmed", {
      settlementId: settlement.id,
      userId: settlement.userId,
      transactionHash: settlement.transactionHash
    });

    return "confirmed";
  }

  return {
    createSettlement(input) {
      return queueSettlementRequest(prisma, settlementQueue, input);
    },

    async processSettlement(settlementId) {
      const settlement = await prisma.settlement.findUnique({
        where: {
          id: settlementId
        }
      });

      if (!settlement) {
        throw new Error(`Settlement ${settlementId} not found`);
      }

      if (settlement.status === "FAILED" || settlement.status === "CONFIRMED") {
        return;
      }

      if (settlement.status === "PENDING") {
        await submitSettlement(settlementId);
      }

      await reconcileSettlement(settlementId);
    },

    async reconcileSubmittedSettlements(limit = 50) {
      const settlements = await prisma.settlement.findMany({
        where: {
          status: {
            in: [...SUBMITTED_STATUS]
          }
        },
        take: limit
      });

      const summary = {
        processed: 0,
        confirmed: 0,
        failed: 0,
        pending: 0
      };

      for (const settlement of settlements) {
        const result = await reconcileSettlement(settlement.id);
        summary.processed += 1;
        summary[result] += 1;
      }

      return summary;
    },

    async syncAllWallets() {
      const users = await prisma.user.findMany({
        select: {
          walletAddress: true
        }
      });

      for (const user of users) {
        await vaultSyncService.syncWallet(user.walletAddress);
      }

      return {
        synced: users.length
      };
    }
  };
}
