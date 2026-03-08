import { Decimal } from "@prisma/client/runtime/library";
import { RISK_PARAMETERS } from "@hypermarket/shared";
import { AccountPrismaLike, createAccountService } from "./account-service.js";
import { toDecimal } from "./decimal.js";
import { PositionSide } from "./position-service.js";
import { calculateLiquidationPrice } from "./risk-formulas.js";

type PositionStatus = "OPEN" | "CLOSING" | "CLOSED" | "LIQUIDATING" | "LIQUIDATED";
type LiquidationStatus = "QUEUED" | "IN_PROGRESS" | "SETTLED" | "FAILED";

interface LiquidationPosition {
  id: string;
  userId: string;
  marketId: string;
  outcomeTokenId: string | null;
  side: PositionSide;
  status: PositionStatus;
  size: Decimal;
  notional: Decimal;
  leverage: Decimal;
  entryPrice: Decimal;
  markPrice: Decimal;
  liquidationPrice: Decimal;
  initialMargin: Decimal;
  maintenanceMargin: Decimal;
  unrealizedPnl: Decimal;
  realizedPnl: Decimal;
}

interface LiquidationRecord {
  id: string;
  userId: string;
  positionId: string;
  marketId: string;
  markPrice: Decimal;
  liquidationPrice: Decimal;
  penalty: Decimal;
  status: LiquidationStatus;
}

interface PositionDelegate {
  findMany(args: {
    where: { status: { in: readonly string[] } };
  }): Promise<LiquidationPosition[]>;
  findUnique(args: { where: { id: string } }): Promise<LiquidationPosition | null>;
  update(args: {
    where: { id: string };
    data: Partial<LiquidationPosition> & {
      updatedAt?: Date | null;
      closedAt?: Date | null;
    };
  }): Promise<LiquidationPosition>;
}

interface LiquidationDelegate {
  findFirst(args: {
    where: { positionId: string; status: { in: readonly string[] } };
  }): Promise<LiquidationRecord | null>;
  findUnique(args: { where: { id: string } }): Promise<LiquidationRecord | null>;
  create(args: {
    data: {
      userId: string;
      positionId: string;
      marketId: string;
      markPrice: Decimal;
      liquidationPrice: Decimal;
      penalty: Decimal;
      status: LiquidationStatus;
      reason: string;
    };
  }): Promise<LiquidationRecord>;
  update(args: {
    where: { id: string };
    data: {
      status: LiquidationStatus;
      settledAt: Date;
    };
  }): Promise<LiquidationRecord>;
}

interface TransactionLike extends AccountPrismaLike {
  position: PositionDelegate & AccountPrismaLike["position"];
  liquidation: LiquidationDelegate;
}

export interface LiquidationPrismaLike extends TransactionLike {
  $transaction<T>(callback: (tx: TransactionLike) => Promise<T>): Promise<T>;
}

interface LiquidationQueueLike {
  add(
    name: string,
    data: {
      liquidationId: string;
      userId: string;
      positionId: string;
      marketId: string;
      triggerPrice: number;
    }
  ): Promise<unknown>;
}

export interface PriceSnapshotLike {
  marketId: string;
  outcomeTokenId: string;
  markPrice: number | null;
}

export interface LiquidationService {
  scanAndQueueLiquidations(priceSnapshots: PriceSnapshotLike[]): Promise<{
    queued: number;
  }>;
  finalizeLiquidation(liquidationId: string): Promise<void>;
}

const ACTIVE_SCAN_STATUSES = ["OPEN"] as const;
const PENDING_LIQUIDATION_STATUSES = ["QUEUED", "IN_PROGRESS"] as const;

export function isPositionLiquidatable(
  side: PositionSide,
  markPrice: Decimal | number | string,
  liquidationPrice: Decimal | number | string
): boolean {
  const mark = toDecimal(markPrice);
  const threshold = toDecimal(liquidationPrice);

  return side === "LONG" ? mark.lte(threshold) : mark.gte(threshold);
}

function buildPriceIndex(
  priceSnapshots: PriceSnapshotLike[]
): Map<string, Decimal> {
  const index = new Map<string, Decimal>();

  for (const snapshot of priceSnapshots) {
    if (snapshot.markPrice === null) {
      continue;
    }

    index.set(snapshot.outcomeTokenId, toDecimal(snapshot.markPrice));
  }

  return index;
}

export function createLiquidationService(
  prisma: LiquidationPrismaLike,
  liquidationQueue: LiquidationQueueLike
): LiquidationService {
  return {
    async scanAndQueueLiquidations(priceSnapshots) {
      const priceIndex = buildPriceIndex(priceSnapshots);
      const positions = await prisma.position.findMany({
        where: {
          status: {
            in: [...ACTIVE_SCAN_STATUSES]
          }
        }
      });

      let queued = 0;

      for (const position of positions) {
        if (!position.outcomeTokenId) {
          continue;
        }

        const currentMarkPrice = priceIndex.get(position.outcomeTokenId);
        if (!currentMarkPrice) {
          continue;
        }

        const liquidationPrice = calculateLiquidationPrice(
          position.side,
          position.entryPrice,
          position.leverage
        );

        if (
          !isPositionLiquidatable(position.side, currentMarkPrice, liquidationPrice)
        ) {
          continue;
        }

        await prisma.$transaction(async (tx: TransactionLike) => {
          const existingLiquidation = await tx.liquidation.findFirst({
            where: {
              positionId: position.id,
              status: {
                in: [...PENDING_LIQUIDATION_STATUSES]
              }
            }
          });

          if (existingLiquidation) {
            return;
          }

          const liquidation = await tx.liquidation.create({
            data: {
              userId: position.userId,
              positionId: position.id,
              marketId: position.marketId,
              markPrice: currentMarkPrice,
              liquidationPrice,
              penalty: Decimal.max(
                position.maintenanceMargin,
                currentMarkPrice.mul(position.size).mul(
                  toDecimal(RISK_PARAMETERS.liquidationBufferRatio)
                )
              ),
              status: "QUEUED",
              reason: "MARK_PRICE_BREACHED_LIQUIDATION_THRESHOLD"
            }
          });

          await tx.position.update({
            where: {
              id: position.id
            },
            data: {
              markPrice: currentMarkPrice,
              liquidationPrice,
              status: "LIQUIDATING",
              updatedAt: new Date()
            }
          });

          const accountService = createAccountService(tx);
          await accountService.syncMarginAccount({
            userId: position.userId
          });

          await liquidationQueue.add("liquidation", {
            liquidationId: liquidation.id,
            userId: position.userId,
            positionId: position.id,
            marketId: position.marketId,
            triggerPrice: Number(currentMarkPrice.toString())
          });

          queued += 1;
        });
      }

      return { queued };
    },

    async finalizeLiquidation(liquidationId) {
      await prisma.$transaction(async (tx: TransactionLike) => {
        const liquidation = await tx.liquidation.findUnique({
          where: {
            id: liquidationId
          }
        });

        if (!liquidation) {
          throw new Error(`Liquidation ${liquidationId} not found`);
        }

        const position = await tx.position.findUnique({
          where: {
            id: liquidation.positionId
          }
        });

        if (!position) {
          throw new Error(`Position ${liquidation.positionId} not found`);
        }

        if (liquidation.status !== "QUEUED" && liquidation.status !== "IN_PROGRESS") {
          return;
        }

        const realizedPnlDelta =
          position.side === "LONG"
            ? liquidation.markPrice.minus(position.entryPrice).mul(position.size)
            : position.entryPrice.minus(liquidation.markPrice).mul(position.size);

        await tx.position.update({
          where: {
            id: position.id
          },
          data: {
            size: toDecimal(0),
            notional: toDecimal(0),
            markPrice: liquidation.markPrice,
            initialMargin: toDecimal(0),
            maintenanceMargin: toDecimal(0),
            unrealizedPnl: toDecimal(0),
            realizedPnl: position.realizedPnl.plus(realizedPnlDelta),
            status: "LIQUIDATED",
            closedAt: new Date(),
            updatedAt: new Date()
          }
        });

        await tx.liquidation.update({
          where: {
            id: liquidation.id
          },
          data: {
            status: "SETTLED",
            settledAt: new Date()
          }
        });

        const accountService = createAccountService(tx);
        await accountService.syncMarginAccount({
          userId: position.userId
        });
      });
    }
  };
}
