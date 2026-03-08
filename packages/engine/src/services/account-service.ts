import { Decimal } from "@prisma/client/runtime/library";
import { DECIMAL_ZERO } from "./decimal.js";
import { calculateAccountMetrics } from "./risk-formulas.js";

interface UserDelegate {
  upsert(args: {
    where: { walletAddress: string };
    create: { walletAddress: string };
    update: Record<string, never>;
  }): Promise<{ id: string; walletAddress: string }>;
  findUnique?(args: {
    where: { walletAddress: string };
  }): Promise<{ id: string; walletAddress: string } | null>;
}

interface MarginAccountRecord {
  id: string;
  userId: string;
  settledBalance: Decimal;
}

interface MarginAccountDelegate {
  upsert(args: {
    where: { userId: string };
    create: {
      userId: string;
      settledBalance: Decimal;
      usedMargin: Decimal;
      freeCollateral: Decimal;
      equity: Decimal;
      marginRatio: Decimal;
      totalUnrealizedPnl: Decimal;
    };
    update: Record<string, never>;
  }): Promise<MarginAccountRecord>;
  findUnique(args: {
    where: { userId: string };
  }): Promise<MarginAccountRecord | null>;
  update(args: {
    where: { userId: string };
    data: {
      settledBalance?: Decimal;
      usedMargin?: Decimal;
      freeCollateral?: Decimal;
      equity?: Decimal;
      marginRatio?: Decimal;
      totalUnrealizedPnl?: Decimal;
      lastSyncedAt?: Date;
    };
  }): Promise<unknown>;
}

interface PositionDelegate {
  findMany(args: {
    where: {
      userId: string;
      status: { in: readonly string[] };
    };
  }): Promise<Array<{ initialMargin: Decimal; unrealizedPnl: Decimal }>>;
}

export interface AccountPrismaLike {
  user: UserDelegate;
  marginAccount: MarginAccountDelegate;
  position: PositionDelegate;
}

interface EnsureAccountInput {
  walletAddress: string;
  settledBalance?: Decimal | number | string;
}

interface SyncMarginAccountInput {
  userId: string;
}

interface SyncSettledBalanceInput {
  userId: string;
  settledBalance: Decimal | number | string;
}

const ACTIVE_POSITION_STATUSES = ["OPEN", "CLOSING", "LIQUIDATING"] as const;

export interface AccountService {
  ensureAccount(input: EnsureAccountInput): Promise<{
    userId: string;
    marginAccountId: string;
  }>;
  findUserByWalletAddress(walletAddress: string): Promise<{
    id: string;
    walletAddress: string;
  } | null>;
  syncSettledBalance(input: SyncSettledBalanceInput): Promise<void>;
  syncMarginAccount(input: SyncMarginAccountInput): Promise<void>;
}

export function createAccountService(prisma: AccountPrismaLike): AccountService {
  return {
    async ensureAccount(input) {
      const settledBalance = new Decimal(input.settledBalance ?? "0");

      const user = await prisma.user.upsert({
        where: {
          walletAddress: input.walletAddress
        },
        create: {
          walletAddress: input.walletAddress
        },
        update: {}
      });

      const account = await prisma.marginAccount.upsert({
        where: {
          userId: user.id
        },
        create: {
          userId: user.id,
          settledBalance,
          usedMargin: DECIMAL_ZERO,
          freeCollateral: settledBalance,
          equity: settledBalance,
          marginRatio: DECIMAL_ZERO,
          totalUnrealizedPnl: DECIMAL_ZERO
        },
        update: {}
      });

      return {
        userId: user.id,
        marginAccountId: account.id
      };
    },

    async findUserByWalletAddress(walletAddress) {
      if (!prisma.user.findUnique) {
        throw new Error("User lookup by wallet address is not supported by this prisma client");
      }

      return prisma.user.findUnique({
        where: {
          walletAddress
        }
      });
    },

    async syncSettledBalance(input) {
      const marginAccount = await prisma.marginAccount.findUnique({
        where: {
          userId: input.userId
        }
      });

      if (!marginAccount) {
        throw new Error(`Margin account not found for user ${input.userId}`);
      }

      await prisma.marginAccount.update({
        where: {
          userId: input.userId
        },
        data: {
          settledBalance: new Decimal(input.settledBalance)
        }
      });
    },

    async syncMarginAccount(input) {
      const marginAccount = await prisma.marginAccount.findUnique({
        where: {
          userId: input.userId
        }
      });

      if (!marginAccount) {
        throw new Error(`Margin account not found for user ${input.userId}`);
      }

      const positions = await prisma.position.findMany({
        where: {
          userId: input.userId,
          status: {
            in: [...ACTIVE_POSITION_STATUSES]
          }
        }
      });

      const usedMargin = positions.reduce(
        (sum: Decimal, position: { initialMargin: Decimal }) =>
          sum.plus(position.initialMargin),
        DECIMAL_ZERO
      );
      const totalUnrealizedPnl = positions.reduce(
        (sum: Decimal, position: { unrealizedPnl: Decimal }) =>
          sum.plus(position.unrealizedPnl),
        DECIMAL_ZERO
      );
      const metrics = calculateAccountMetrics(
        marginAccount.settledBalance,
        usedMargin,
        totalUnrealizedPnl
      );

      await prisma.marginAccount.update({
        where: {
          userId: input.userId
        },
        data: {
          usedMargin,
          freeCollateral: metrics.freeCollateral,
          equity: metrics.equity,
          marginRatio: metrics.marginRatio,
          totalUnrealizedPnl,
          lastSyncedAt: new Date()
        }
      });
    }
  };
}
