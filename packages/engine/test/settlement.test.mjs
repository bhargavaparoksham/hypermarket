import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createSettlementService,
  queueSettlementRequest
} from "../dist/services/settlement-service.js";
import { createLogger } from "../dist/logger.js";

function decimal(value) {
  return new Decimal(value);
}

class FakeSettlementPrisma {
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
      findUnique: async ({ where }) => {
        if (where.id) {
          return this.users.get(where.id) ?? null;
        }

        return (
          [...this.users.values()].find(
            (user) => user.walletAddress === where.walletAddress
          ) ?? null
        );
      },
      findMany: async () =>
        [...this.users.values()].map((user) => ({
          walletAddress: user.walletAddress
        }))
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
          (account) => account.userId === where.userId
        );
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
      findUnique: async ({ where }) => this.settlements.get(where.id) ?? null,
      findFirst: async ({ where }) =>
        [...this.settlements.values()].find((settlement) => {
          if (where.positionId && settlement.positionId !== where.positionId) {
            return false;
          }

          if (where.status?.in && !where.status.in.includes(settlement.status)) {
            return false;
          }

          return true;
        }) ?? null,
      findMany: async ({ where, take }) =>
        [...this.settlements.values()]
          .filter((settlement) => where.status.in.includes(settlement.status))
          .slice(0, take ?? Number.MAX_SAFE_INTEGER),
      create: async ({ data }) => {
        const settlement = {
          id: this.nextId("settlement"),
          positionId: data.positionId ?? null,
          transactionHash: null,
          errorMessage: null,
          ...data
        };
        this.settlements.set(settlement.id, settlement);
        return settlement;
      },
      update: async ({ where, data }) => {
        const settlement = this.settlements.get(where.id);
        Object.assign(settlement, data);
        return settlement;
      }
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

test("queueSettlementRequest deduplicates by position while pending", async () => {
  const prisma = new FakeSettlementPrisma();
  const user = await prisma.user.upsert({
    where: {
      walletAddress: "0x5555555555555555555555555555555555555555"
    },
    create: {
      walletAddress: "0x5555555555555555555555555555555555555555"
    },
    update: {}
  });
  const queuedJobs = [];

  const first = await queueSettlementRequest(
    prisma,
    {
      async add(name, data) {
        queuedJobs.push({ name, data });
      }
    },
    {
      userId: user.id,
      positionId: "position-1",
      pnl: "1.25"
    }
  );

  const second = await queueSettlementRequest(
    prisma,
    {
      async add(name, data) {
        queuedJobs.push({ name, data });
      }
    },
    {
      userId: user.id,
      positionId: "position-1",
      pnl: "1.25"
    }
  );

  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(queuedJobs.length, 1);
});

test("settlement service submits, confirms, and mirrors the wallet balance", async () => {
  const prisma = new FakeSettlementPrisma();
  const logger = createLogger("error");
  const user = await prisma.user.upsert({
    where: {
      walletAddress: "0x6666666666666666666666666666666666666666"
    },
    create: {
      walletAddress: "0x6666666666666666666666666666666666666666"
    },
    update: {}
  });
  await prisma.marginAccount.upsert({
    where: {
      userId: user.id
    },
    create: {
      userId: user.id,
      settledBalance: decimal("100"),
      usedMargin: decimal("0"),
      freeCollateral: decimal("100"),
      equity: decimal("100"),
      marginRatio: decimal("0"),
      totalUnrealizedPnl: decimal("0")
    },
    update: {}
  });
  const queuedJobs = [];
  const service = createSettlementService(
    prisma,
    {
      async add(name, data) {
        queuedJobs.push({ name, data });
      }
    },
    {
      async submitSettlement(walletAddress, pnl) {
        assert.equal(walletAddress, "0x6666666666666666666666666666666666666666");
        assert.equal(pnl, 2_500_000n);
        return "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      },
      async getSettlementReceipt(transactionHash) {
        assert.equal(
          transactionHash,
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
        return {
          status: "confirmed",
          settledEvent: {
            walletAddress: "0x6666666666666666666666666666666666666666",
            pnl: 2_500_000n,
            currentBalance: 100_000_000n,
            finalBalance: 102_500_000n
          }
        };
      },
      async readSettledBalance() {
        return 102_500_000n;
      }
    },
    logger
  );

  const created = await service.createSettlement({
    userId: user.id,
    positionId: "position-2",
    pnl: "2.5"
  });

  assert.equal(created.deduplicated, false);
  assert.equal(queuedJobs.length, 1);

  await service.processSettlement(created.settlementId);

  const settlement = prisma.settlements.get(created.settlementId);
  const account = [...prisma.accounts.values()][0];

  assert.equal(settlement.status, "CONFIRMED");
  assert.equal(
    settlement.transactionHash,
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  assert.equal(account.settledBalance.toString(), "102.5");
});

test("submitted settlements remain pending until a receipt appears", async () => {
  const prisma = new FakeSettlementPrisma();
  const logger = createLogger("error");
  const user = await prisma.user.upsert({
    where: {
      walletAddress: "0x7777777777777777777777777777777777777777"
    },
    create: {
      walletAddress: "0x7777777777777777777777777777777777777777"
    },
    update: {}
  });
  prisma.settlements.set("settlement-1", {
    id: "settlement-1",
    userId: user.id,
    positionId: "position-3",
    amount: decimal("1"),
    pnl: decimal("-1"),
    status: "SUBMITTED",
    direction: "DEBIT",
    transactionHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    errorMessage: null
  });

  const service = createSettlementService(
    prisma,
    {
      async add() {}
    },
    {
      async submitSettlement() {
        throw new Error("submitSettlement should not be called");
      },
      async getSettlementReceipt() {
        return {
          status: "pending"
        };
      },
      async readSettledBalance() {
        return 99_000_000n;
      }
    },
    logger
  );

  const result = await service.reconcileSubmittedSettlements();

  assert.equal(result.processed, 1);
  assert.equal(result.pending, 1);
  assert.equal(prisma.settlements.get("settlement-1").status, "SUBMITTED");
});
