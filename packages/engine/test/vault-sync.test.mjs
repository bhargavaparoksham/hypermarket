import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";
import { createVaultSyncService } from "../dist/services/vault-sync-service.js";

function decimal(value) {
  return new Decimal(value);
}

class FakeVaultSyncPrisma {
  constructor() {
    this.ids = 0;
    this.users = new Map();
    this.accounts = new Map();
    this.positions = new Map();
    this.settlements = new Map();

    this.user = {
      upsert: async ({ where, create }) => {
        const existing = [...this.users.values()].find(
          (user) => user.walletAddress === where.walletAddress
        );
        if (existing) {
          return existing;
        }

        const user = {
          id: this.nextId("user"),
          walletAddress: create.walletAddress
        };
        this.users.set(user.id, user);
        return user;
      },
      findUnique: async ({ where }) =>
        [...this.users.values()].find(
          (user) => user.walletAddress === where.walletAddress
        ) ?? null
    };

    this.marginAccount = {
      upsert: async ({ where, create }) => {
        const existing = [...this.accounts.values()].find(
          (account) => account.userId === where.userId
        );
        if (existing) {
          return existing;
        }

        const account = {
          id: this.nextId("account"),
          ...create,
          lastSyncedAt: null
        };
        this.accounts.set(account.id, account);
        return account;
      },
      findUnique: async ({ where }) =>
        [...this.accounts.values()].find((account) => account.userId === where.userId) ??
        null,
      update: async ({ where, data }) => {
        const account = [...this.accounts.values()].find(
          (entry) => entry.userId === where.userId
        );
        if (!account) {
          throw new Error("account not found");
        }

        Object.assign(account, data);
        return account;
      }
    };

    this.position = {
      findMany: async ({ where }) =>
        [...this.positions.values()].filter((position) => {
          if (where.userId && position.userId !== where.userId) {
            return false;
          }

          if (where.status?.in && !where.status.in.includes(position.status)) {
            return false;
          }

          return true;
        })
    };

    this.settlement = {
      findMany: async ({ where }) =>
        [...this.settlements.values()].filter((settlement) => {
          return (
            settlement.userId === where.userId &&
            where.status.in.includes(settlement.status)
          );
        })
    };
  }

  nextId(prefix) {
    this.ids += 1;
    return `${prefix}-${this.ids}`;
  }

  async $transaction(callback) {
    return callback(this);
  }
}

test("vault sync mirrors the on-chain settled balance into the margin account", async () => {
  const prisma = new FakeVaultSyncPrisma();
  const service = createVaultSyncService(prisma, {
    async readSettledBalance() {
      return 125_500_000n;
    }
  });

  const result = await service.syncWallet(
    "0x3333333333333333333333333333333333333333"
  );

  const account = [...prisma.accounts.values()][0];
  assert.equal(result.onChainSettledBalance.toString(), "125.5");
  assert.equal(result.appliedSettledBalance.toString(), "125.5");
  assert.equal(result.pendingSettlementDelta.toString(), "0");
  assert.equal(result.pendingSettlementCount, 0);
  assert.equal(account.settledBalance.toString(), "125.5");
  assert.equal(account.equity.toString(), "125.5");
  assert.equal(account.freeCollateral.toString(), "125.5");
});

test("vault sync reports pending settlements without double-applying them", async () => {
  const prisma = new FakeVaultSyncPrisma();
  const walletAddress = "0x4444444444444444444444444444444444444444";
  const service = createVaultSyncService(prisma, {
    async readSettledBalance() {
      return 90_000_000n;
    }
  });

  const firstResult = await service.syncWallet(walletAddress);
  prisma.settlements.set("settlement-1", {
    id: "settlement-1",
    userId: firstResult.userId,
    amount: decimal("15.250000"),
    status: "PENDING",
    direction: "CREDIT"
  });
  prisma.settlements.set("settlement-2", {
    id: "settlement-2",
    userId: firstResult.userId,
    amount: decimal("3.500000"),
    status: "SUBMITTED",
    direction: "DEBIT"
  });
  prisma.settlements.set("settlement-3", {
    id: "settlement-3",
    userId: firstResult.userId,
    amount: decimal("9.000000"),
    status: "CONFIRMED",
    direction: "CREDIT"
  });

  const secondResult = await service.syncWallet(walletAddress);
  const account = [...prisma.accounts.values()][0];

  assert.equal(secondResult.onChainSettledBalance.toString(), "90");
  assert.equal(secondResult.appliedSettledBalance.toString(), "90");
  assert.equal(secondResult.pendingSettlementDelta.toString(), "11.75");
  assert.equal(secondResult.pendingSettlementCount, 2);
  assert.equal(account.settledBalance.toString(), "90");
});
