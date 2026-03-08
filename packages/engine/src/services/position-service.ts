import { Decimal } from "@prisma/client/runtime/library";
import {
  AccountPrismaLike,
  createAccountService
} from "./account-service.js";
import { DECIMAL_ONE, DECIMAL_ZERO, toDecimal } from "./decimal.js";
import {
  queueSettlementRequest,
  type CreateSettlementInput,
  type SettlementPrismaLike,
  type SettlementQueueLike
} from "./settlement-service.js";
import {
  calculateLiquidationPrice,
  calculateInitialMargin,
  calculateMaintenanceMargin,
  calculatePositionNotional,
  calculateUnrealizedPnl
} from "./risk-formulas.js";

export type PositionSide = "LONG" | "SHORT";
export type PositionStatus =
  | "OPEN"
  | "CLOSING"
  | "CLOSED"
  | "LIQUIDATING"
  | "LIQUIDATED";

interface StoredPosition {
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

interface PositionDelegate {
  findFirst(args: {
    where: {
      userId: string;
      marketId: string;
      outcomeTokenId: string | null;
      side: PositionSide;
      status: PositionStatus;
    };
  }): Promise<StoredPosition | null>;
  findUnique(args: { where: { id: string } }): Promise<StoredPosition | null>;
  create(args: {
    data: Omit<StoredPosition, "id">;
  }): Promise<StoredPosition>;
  update(args: {
    where: { id: string };
    data: Partial<StoredPosition> & { closedAt?: Date | null; updatedAt?: Date | null };
  }): Promise<StoredPosition>;
  findMany: AccountPrismaLike["position"]["findMany"];
}

interface TransactionLike extends AccountPrismaLike {
  position: PositionDelegate;
}

export interface PositionPrismaLike extends TransactionLike {
  $transaction<T>(callback: (tx: TransactionLike) => Promise<T>): Promise<T>;
}

interface OpenPositionInput {
  walletAddress: string;
  marketId: string;
  outcomeTokenId?: string | null;
  side: PositionSide;
  size: Decimal | number | string;
  entryPrice: Decimal | number | string;
  leverage: Decimal | number | string;
  markPrice?: Decimal | number | string;
  liquidationPrice?: Decimal | number | string;
  initialMargin?: Decimal | number | string;
  maintenanceMargin?: Decimal | number | string;
}

interface ClosePositionInput {
  positionId: string;
  size: Decimal | number | string;
  exitPrice: Decimal | number | string;
  markPrice?: Decimal | number | string;
}

export interface PositionService {
  openPosition(input: OpenPositionInput): Promise<{ positionId: string }>;
  closePosition(input: ClosePositionInput): Promise<{ positionId: string }>;
}

type QueueSettlementFn = (
  prisma: SettlementPrismaLike,
  settlementQueue: SettlementQueueLike,
  input: CreateSettlementInput
) => Promise<{ settlementId: string; deduplicated: boolean }>;

function calculateRealizedPnl(
  side: PositionSide,
  entryPrice: Decimal,
  exitPrice: Decimal,
  size: Decimal
): Decimal {
  const priceDelta =
    side === "LONG" ? exitPrice.minus(entryPrice) : entryPrice.minus(exitPrice);

  return priceDelta.mul(size);
}

export function createPositionService(
  prisma: PositionPrismaLike,
  options?: {
    settlementQueue?: SettlementQueueLike;
    queueSettlement?: QueueSettlementFn;
  }
): PositionService {
  return {
    async openPosition(input) {
      return prisma.$transaction(async (tx: TransactionLike) => {
        const accountService = createAccountService(tx);
        const { userId } = await accountService.ensureAccount({
          walletAddress: input.walletAddress
        });

        const size = toDecimal(input.size);
        const entryPrice = toDecimal(input.entryPrice);
        const leverage = toDecimal(input.leverage);
        const markPrice = toDecimal(input.markPrice ?? input.entryPrice);
        const notional = calculatePositionNotional(size, entryPrice);
        const liquidationPrice =
          input.liquidationPrice !== undefined
            ? toDecimal(input.liquidationPrice)
            : calculateLiquidationPrice(
                input.side,
                entryPrice,
                leverage
              );
        const initialMargin =
          input.initialMargin !== undefined
            ? toDecimal(input.initialMargin)
            : calculateInitialMargin(notional, leverage);
        const maintenanceMargin =
          input.maintenanceMargin !== undefined
            ? toDecimal(input.maintenanceMargin)
            : calculateMaintenanceMargin(notional);
        const unrealizedPnl = calculateUnrealizedPnl(
          input.side,
          entryPrice,
          markPrice,
          size
        );

        const existing = await tx.position.findFirst({
          where: {
            userId,
            marketId: input.marketId,
            outcomeTokenId: input.outcomeTokenId ?? null,
            side: input.side,
            status: "OPEN"
          }
        });

        let positionId: string;

        if (!existing) {
          const created = await tx.position.create({
            data: {
              userId,
              marketId: input.marketId,
              outcomeTokenId: input.outcomeTokenId ?? null,
              side: input.side,
              status: "OPEN",
              size,
              notional,
              leverage,
              entryPrice,
              markPrice,
              liquidationPrice,
              initialMargin,
              maintenanceMargin,
              unrealizedPnl,
              realizedPnl: DECIMAL_ZERO
            }
          });

          positionId = created.id;
        } else {
          const newSize = existing.size.plus(size);
          const weightedEntryNumerator = existing.entryPrice
            .mul(existing.size)
            .plus(entryPrice.mul(size));
          const newEntryPrice = weightedEntryNumerator.div(newSize);
          const newNotional = calculatePositionNotional(newSize, newEntryPrice);
          const newInitialMargin = calculateInitialMargin(newNotional, leverage);
          const newMaintenanceMargin = calculateMaintenanceMargin(newNotional);
          const newUnrealizedPnl = calculateUnrealizedPnl(
            existing.side,
            newEntryPrice,
            markPrice,
            newSize
          );
          const updated = await tx.position.update({
            where: {
              id: existing.id
            },
            data: {
              size: newSize,
              notional: newNotional,
              leverage,
              entryPrice: newEntryPrice,
              markPrice,
              liquidationPrice,
              initialMargin: newInitialMargin,
              maintenanceMargin: newMaintenanceMargin,
              unrealizedPnl: newUnrealizedPnl,
              updatedAt: new Date()
            }
          });

          positionId = updated.id;
        }

        await accountService.syncMarginAccount({
          userId
        });

        return { positionId };
      });
    },

    async closePosition(input) {
      return prisma.$transaction(async (tx: TransactionLike) => {
        const position = await tx.position.findUnique({
          where: {
            id: input.positionId
          }
        });

        if (!position) {
          throw new Error(`Position ${input.positionId} not found`);
        }

        if (position.status !== "OPEN") {
          throw new Error(`Position ${input.positionId} is not open`);
        }

        const closeSize = toDecimal(input.size);
        if (closeSize.lte(DECIMAL_ZERO) || closeSize.greaterThan(position.size)) {
          throw new Error(`Invalid close size for position ${input.positionId}`);
        }

        const exitPrice = toDecimal(input.exitPrice);
        const markPrice = toDecimal(input.markPrice ?? input.exitPrice);
        const realizedPnlDelta = calculateRealizedPnl(
          position.side,
          position.entryPrice,
          exitPrice,
          closeSize
        );
        const remainingSize = position.size.minus(closeSize);
        const closeFraction = closeSize.div(position.size);
        const remainingFraction = DECIMAL_ONE.minus(closeFraction);
        const remainingNotional = calculatePositionNotional(
          remainingSize,
          position.entryPrice
        );
        const remainingInitialMargin = calculateInitialMargin(
          remainingNotional,
          position.leverage
        );
        const remainingMaintenanceMargin =
          calculateMaintenanceMargin(remainingNotional);
        const remainingUnrealizedPnl = calculateUnrealizedPnl(
          position.side,
          position.entryPrice,
          markPrice,
          remainingSize
        );

        await tx.position.update({
          where: {
            id: position.id
          },
          data: {
            size: remainingSize,
            notional: remainingNotional,
            markPrice,
            initialMargin: remainingInitialMargin,
            maintenanceMargin: remainingMaintenanceMargin,
            unrealizedPnl: remainingUnrealizedPnl,
            realizedPnl: position.realizedPnl.plus(realizedPnlDelta),
            status: remainingSize.equals(DECIMAL_ZERO) ? "CLOSED" : "OPEN",
            closedAt: remainingSize.equals(DECIMAL_ZERO) ? new Date() : null,
            updatedAt: new Date()
          }
        });

        const accountService = createAccountService(tx);
        await accountService.syncMarginAccount({
          userId: position.userId
        });

        if (options?.settlementQueue) {
          await (options.queueSettlement ?? queueSettlementRequest)(
            tx as unknown as SettlementPrismaLike,
            options.settlementQueue,
            {
              userId: position.userId,
              positionId: position.id,
              pnl: realizedPnlDelta
            }
          );
        }

        return { positionId: position.id };
      });
    }
  };
}
