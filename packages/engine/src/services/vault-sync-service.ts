import { Decimal } from "@prisma/client/runtime/library";
import { AccountPrismaLike, createAccountService } from "./account-service.js";
import { DECIMAL_ZERO } from "./decimal.js";

const COLLATERAL_DECIMALS = 6;
const PENDING_SETTLEMENT_STATUSES = ["PENDING", "SUBMITTED"] as const;

interface SettlementRecord {
  id: string;
  amount: Decimal;
  status: string;
  direction?: string;
}

interface SettlementDelegate {
  findMany(args: {
    where: {
      userId: string;
      status: { in: readonly string[] };
    };
  }): Promise<SettlementRecord[]>;
}

export interface VaultBalanceReader {
  readSettledBalance(walletAddress: string): Promise<bigint>;
}

export interface VaultSyncPrismaLike extends AccountPrismaLike {
  settlement: SettlementDelegate;
  $transaction?<T>(callback: (tx: VaultSyncPrismaLike) => Promise<T>): Promise<T>;
}

export interface VaultBalanceSyncResult {
  userId: string;
  walletAddress: string;
  onChainSettledBalance: Decimal;
  appliedSettledBalance: Decimal;
  pendingSettlementDelta: Decimal;
  pendingSettlementCount: number;
}

export interface VaultSyncService {
  syncWallet(walletAddress: string): Promise<VaultBalanceSyncResult>;
}

function formatUnits(value: bigint, decimals = COLLATERAL_DECIMALS): Decimal {
  if (decimals < 0) {
    throw new Error(`Invalid decimals value: ${decimals}`);
  }

  const negative = value < 0n;
  const absoluteValue = negative ? -value : value;

  if (decimals === 0) {
    return new Decimal(`${negative ? "-" : ""}${absoluteValue.toString()}`);
  }

  const scale = 10n ** BigInt(decimals);
  const whole = absoluteValue / scale;
  const fraction = absoluteValue % scale;

  return new Decimal(
    `${negative ? "-" : ""}${whole.toString()}.${fraction
      .toString()
      .padStart(decimals, "0")}`
  );
}

async function runInTransaction<T>(
  prisma: VaultSyncPrismaLike,
  callback: (tx: VaultSyncPrismaLike) => Promise<T>
): Promise<T> {
  if (prisma.$transaction) {
    return prisma.$transaction(callback);
  }

  return callback(prisma);
}

export function createVaultSyncService(
  prisma: VaultSyncPrismaLike,
  vaultBalanceReader: VaultBalanceReader
): VaultSyncService {
  return {
    async syncWallet(walletAddress) {
      return runInTransaction(prisma, async (tx) => {
        const accountService = createAccountService(tx);
        const ensuredAccount = await accountService.ensureAccount({
          walletAddress
        });
        const onChainSettledBalance = formatUnits(
          await vaultBalanceReader.readSettledBalance(walletAddress)
        );
        const pendingSettlements = await tx.settlement.findMany({
          where: {
            userId: ensuredAccount.userId,
            status: {
              in: [...PENDING_SETTLEMENT_STATUSES]
            }
          }
        });
        const pendingSettlementDelta = pendingSettlements.reduce(
          (sum, settlement) =>
            sum.plus(
              settlement.direction === "DEBIT"
                ? settlement.amount.negated()
                : settlement.amount
            ),
          DECIMAL_ZERO
        );

        await accountService.syncSettledBalance({
          userId: ensuredAccount.userId,
          settledBalance: onChainSettledBalance
        });
        await accountService.syncMarginAccount({
          userId: ensuredAccount.userId
        });

        return {
          userId: ensuredAccount.userId,
          walletAddress,
          onChainSettledBalance,
          appliedSettledBalance: onChainSettledBalance,
          pendingSettlementDelta,
          pendingSettlementCount: pendingSettlements.length
        };
      });
    }
  };
}
