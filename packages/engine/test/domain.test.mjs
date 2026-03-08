import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";
import { createAccountService } from "../dist/services/account-service.js";
import { createPositionService } from "../dist/services/position-service.js";

const PositionSide = {
  LONG: "LONG",
  SHORT: "SHORT"
};

const PositionStatus = {
  OPEN: "OPEN",
  CLOSED: "CLOSED"
};

class FakeEnginePrisma {
  constructor() {
    this.users = new Map();
    this.accounts = new Map();
    this.positions = new Map();
    this.settlements = new Map();
    this.ids = 0;

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
          walletAddress: create.walletAddress,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.users.set(user.id, user);
        return user;
      },
      findUnique: async ({ where }) => {
        if (where.id) {
          return this.users.get(where.id) ?? null;
        }

        return (
          [...this.users.values()].find((user) => user.walletAddress === where.walletAddress) ??
          null
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
          lastSyncedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.accounts.set(account.id, account);
        return account;
      },
      findUnique: async ({ where }) => {
        return (
          [...this.accounts.values()].find((account) => account.userId === where.userId) ??
          null
        );
      },
      update: async ({ where, data }) => {
        const account = [...this.accounts.values()].find(
          (entry) => entry.userId === where.userId
        );
        if (!account) {
          throw new Error("account not found");
        }

        Object.assign(account, data, { updatedAt: new Date() });
        return account;
      }
    };

    this.position = {
      findMany: async ({ where }) => {
        return [...this.positions.values()].filter((position) => {
          if (where.userId && position.userId !== where.userId) {
            return false;
          }

          if (where.status?.in && !where.status.in.includes(position.status)) {
            return false;
          }

          return true;
        });
      },
      findFirst: async ({ where }) => {
        return (
          [...this.positions.values()].find((position) => {
            return (
              position.userId === where.userId &&
              position.marketId === where.marketId &&
              position.outcomeTokenId === where.outcomeTokenId &&
              position.side === where.side &&
              position.status === where.status
            );
          }) ?? null
        );
      },
      findUnique: async ({ where }) => {
        return this.positions.get(where.id) ?? null;
      },
      create: async ({ data }) => {
        const position = {
          id: this.nextId("position"),
          ...data,
          openedAt: new Date(),
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.positions.set(position.id, position);
        return position;
      },
      update: async ({ where, data }) => {
        const position = this.positions.get(where.id);
        if (!position) {
          throw new Error("position not found");
        }

        Object.assign(position, data, { updatedAt: new Date() });
        return position;
      }
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
      findMany: async ({ where }) =>
        [...this.settlements.values()].filter((settlement) => {
          if (where.userId && settlement.userId !== where.userId) {
            return false;
          }

          if (where.status?.in && !where.status.in.includes(settlement.status)) {
            return false;
          }

          return true;
        }),
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
        if (!settlement) {
          throw new Error("settlement not found");
        }

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

function decimal(value) {
  return new Decimal(value);
}

test("account service creates a user and syncs margin aggregates", async () => {
  const prisma = new FakeEnginePrisma();
  const accountService = createAccountService(prisma);

  const { userId } = await accountService.ensureAccount({
    walletAddress: "0x1111111111111111111111111111111111111111",
    settledBalance: "100.000000"
  });

  await prisma.position.create({
    data: {
      userId,
      marketId: "market-1",
      outcomeTokenId: "yes-token",
      side: PositionSide.LONG,
      status: PositionStatus.OPEN,
      size: decimal("10"),
      notional: decimal("4"),
      leverage: decimal("2"),
      entryPrice: decimal("0.4"),
      markPrice: decimal("0.45"),
      liquidationPrice: decimal("0.2"),
      initialMargin: decimal("2"),
      maintenanceMargin: decimal("0.5"),
      unrealizedPnl: decimal("0.5"),
      realizedPnl: decimal("0")
    }
  });

  await accountService.syncMarginAccount({ userId });

  const account = await prisma.marginAccount.findUnique({ where: { userId } });
  assert.equal(account.usedMargin.toString(), "2");
  assert.equal(account.totalUnrealizedPnl.toString(), "0.5");
  assert.equal(account.equity.toString(), "100.5");
  assert.equal(account.freeCollateral.toString(), "98.5");
});

test("position service opens and averages into an existing long position", async () => {
  const prisma = new FakeEnginePrisma();
  const positionService = createPositionService(prisma);

  const first = await positionService.openPosition({
    walletAddress: "0x2222222222222222222222222222222222222222",
    marketId: "market-1",
    outcomeTokenId: "yes-token",
    side: PositionSide.LONG,
    size: "10",
    entryPrice: "0.40",
    leverage: "4",
    liquidationPrice: "0.20",
    initialMargin: "1",
    maintenanceMargin: "0.25"
  });

  await positionService.openPosition({
    walletAddress: "0x2222222222222222222222222222222222222222",
    marketId: "market-1",
    outcomeTokenId: "yes-token",
    side: PositionSide.LONG,
    size: "5",
    entryPrice: "0.60",
    leverage: "4",
    liquidationPrice: "0.30",
    initialMargin: "0.75",
    maintenanceMargin: "0.15"
  });

  const position = await prisma.position.findUnique({ where: { id: first.positionId } });
  assert.equal(position.size.toString(), "15");
  assert.ok(
    position.notional.minus(decimal("7")).abs().lte(decimal("0.000000000000000001"))
  );
  assert.ok(
    position.entryPrice
      .minus(decimal("0.46666666666666666667"))
      .abs()
      .lte(decimal("0.0000000000000000001"))
  );
  assert.equal(position.initialMargin.toString(), "1.75");
});

test("position service supports partial close with realized pnl", async () => {
  const prisma = new FakeEnginePrisma();
  const positionService = createPositionService(prisma);

  const opened = await positionService.openPosition({
    walletAddress: "0x3333333333333333333333333333333333333333",
    marketId: "market-1",
    outcomeTokenId: "yes-token",
    side: PositionSide.LONG,
    size: "10",
    entryPrice: "0.40",
    leverage: "3",
    liquidationPrice: "0.20",
    initialMargin: "2",
    maintenanceMargin: "0.5"
  });

  await positionService.closePosition({
    positionId: opened.positionId,
    size: "4",
    exitPrice: "0.55"
  });

  const position = await prisma.position.findUnique({ where: { id: opened.positionId } });
  assert.equal(position.status, PositionStatus.OPEN);
  assert.equal(position.size.toString(), "6");
  assert.equal(position.notional.toString(), "2.4");
  assert.equal(position.realizedPnl.toString(), "0.6");
});

test("position service fully closes a short position", async () => {
  const prisma = new FakeEnginePrisma();
  const positionService = createPositionService(prisma);

  const opened = await positionService.openPosition({
    walletAddress: "0x4444444444444444444444444444444444444444",
    marketId: "market-2",
    outcomeTokenId: "no-token",
    side: PositionSide.SHORT,
    size: "8",
    entryPrice: "0.70",
    leverage: "3",
    liquidationPrice: "0.90",
    initialMargin: "1.5",
    maintenanceMargin: "0.4"
  });

  await positionService.closePosition({
    positionId: opened.positionId,
    size: "8",
    exitPrice: "0.50"
  });

  const position = await prisma.position.findUnique({ where: { id: opened.positionId } });
  assert.equal(position.status, PositionStatus.CLOSED);
  assert.equal(position.size.toString(), "0");
  assert.equal(position.realizedPnl.toString(), "1.6");
  assert.ok(position.closedAt instanceof Date);
});

test("position service enqueues a settlement when realized pnl changes", async () => {
  const prisma = new FakeEnginePrisma();
  const queuedJobs = [];
  const positionService = createPositionService(prisma, {
    settlementQueue: {
      async add(name, data) {
        queuedJobs.push({ name, data });
      }
    }
  });

  const opened = await positionService.openPosition({
    walletAddress: "0x5555555555555555555555555555555555555555",
    marketId: "market-3",
    outcomeTokenId: "yes-token",
    side: PositionSide.LONG,
    size: "10",
    entryPrice: "0.40",
    leverage: "3",
    liquidationPrice: "0.20",
    initialMargin: "2",
    maintenanceMargin: "0.5"
  });

  await positionService.closePosition({
    positionId: opened.positionId,
    size: "10",
    exitPrice: "0.50"
  });

  assert.equal(queuedJobs.length, 1);
  const [settlement] = prisma.settlements.values();
  assert.equal(settlement.status, "PENDING");
  assert.equal(settlement.pnl.toString(), "1");
  assert.equal(settlement.direction, "CREDIT");
});
