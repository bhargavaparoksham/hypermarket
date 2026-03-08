import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createLiquidationService,
  isPositionLiquidatable
} from "../dist/services/liquidation-service.js";

function decimal(value) {
  return new Decimal(value);
}

class FakeLiquidationPrisma {
  constructor() {
    this.positions = new Map();
    this.liquidations = new Map();
    this.accounts = new Map();
    this.ids = 0;

    this.user = {
      upsert: async ({ where, create }) => ({
        id: `user-${where.walletAddress}`,
        walletAddress: create.walletAddress
      })
    };

    this.marginAccount = {
      upsert: async ({ where, create }) => {
        const existing = this.accounts.get(where.userId);
        if (existing) {
          return existing;
        }

        const account = {
          id: this.nextId("account"),
          ...create,
          lastSyncedAt: null
        };
        this.accounts.set(where.userId, account);
        return account;
      },
      findUnique: async ({ where }) => this.accounts.get(where.userId) ?? null,
      update: async ({ where, data }) => {
        const account = this.accounts.get(where.userId);
        Object.assign(account, data);
        return account;
      }
    };

    this.position = {
      findMany: async ({ where }) =>
        [...this.positions.values()].filter((position) =>
          where.status.in.includes(position.status)
        ),
      findUnique: async ({ where }) => this.positions.get(where.id) ?? null,
      update: async ({ where, data }) => {
        const position = this.positions.get(where.id);
        Object.assign(position, data);
        return position;
      }
    };

    this.liquidation = {
      findFirst: async ({ where }) =>
        [...this.liquidations.values()].find(
          (liquidation) =>
            liquidation.positionId === where.positionId &&
            where.status.in.includes(liquidation.status)
        ) ?? null,
      findUnique: async ({ where }) => this.liquidations.get(where.id) ?? null,
      create: async ({ data }) => {
        const liquidation = {
          id: this.nextId("liquidation"),
          ...data
        };
        this.liquidations.set(liquidation.id, liquidation);
        return liquidation;
      },
      update: async ({ where, data }) => {
        const liquidation = this.liquidations.get(where.id);
        Object.assign(liquidation, data);
        return liquidation;
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

test("detects the reference 10x long liquidation threshold", () => {
  assert.equal(isPositionLiquidatable("LONG", "0.455", "0.455"), true);
  assert.equal(isPositionLiquidatable("LONG", "0.46", "0.455"), false);
});

test("queues a liquidation job and transitions the position", async () => {
  const prisma = new FakeLiquidationPrisma();
  prisma.accounts.set("user-1", {
    id: "account-1",
    userId: "user-1",
    settledBalance: decimal("100"),
    usedMargin: decimal("5"),
    freeCollateral: decimal("95"),
    equity: decimal("100"),
    marginRatio: decimal("0.05"),
    totalUnrealizedPnl: decimal("0"),
    lastSyncedAt: null
  });
  prisma.positions.set("position-1", {
    id: "position-1",
    userId: "user-1",
    marketId: "market-1",
    outcomeTokenId: "token-1",
    side: "LONG",
    status: "OPEN",
    size: decimal("100"),
    notional: decimal("50"),
    leverage: decimal("10"),
    entryPrice: decimal("0.50"),
    markPrice: decimal("0.50"),
    liquidationPrice: decimal("0.455"),
    initialMargin: decimal("5"),
    maintenanceMargin: decimal("2.5"),
    unrealizedPnl: decimal("0"),
    realizedPnl: decimal("0")
  });

  const queuedJobs = [];
  const service = createLiquidationService(prisma, {
    async add(name, data) {
      queuedJobs.push({ name, data });
    }
  });

  const result = await service.scanAndQueueLiquidations([
    {
      marketId: "market-1",
      outcomeTokenId: "token-1",
      markPrice: 0.455
    }
  ]);

  assert.equal(result.queued, 1);
  assert.equal(queuedJobs.length, 1);
  assert.equal(queuedJobs[0].name, "liquidation");

  const position = prisma.positions.get("position-1");
  assert.equal(position.status, "LIQUIDATING");

  const [liquidation] = prisma.liquidations.values();
  assert.equal(liquidation.status, "QUEUED");
  assert.equal(liquidation.reason, "MARK_PRICE_BREACHED_LIQUIDATION_THRESHOLD");
});

test("does not queue duplicate liquidations for the same position", async () => {
  const prisma = new FakeLiquidationPrisma();
  prisma.accounts.set("user-1", {
    id: "account-1",
    userId: "user-1",
    settledBalance: decimal("100"),
    usedMargin: decimal("5"),
    freeCollateral: decimal("95"),
    equity: decimal("100"),
    marginRatio: decimal("0.05"),
    totalUnrealizedPnl: decimal("0"),
    lastSyncedAt: null
  });
  prisma.positions.set("position-1", {
    id: "position-1",
    userId: "user-1",
    marketId: "market-1",
    outcomeTokenId: "token-1",
    side: "LONG",
    status: "OPEN",
    size: decimal("100"),
    notional: decimal("50"),
    leverage: decimal("10"),
    entryPrice: decimal("0.50"),
    markPrice: decimal("0.50"),
    liquidationPrice: decimal("0.455"),
    initialMargin: decimal("5"),
    maintenanceMargin: decimal("2.5"),
    unrealizedPnl: decimal("0"),
    realizedPnl: decimal("0")
  });
  prisma.liquidations.set("liquidation-1", {
    id: "liquidation-1",
    positionId: "position-1",
    status: "QUEUED"
  });

  const queuedJobs = [];
  const service = createLiquidationService(prisma, {
    async add(name, data) {
      queuedJobs.push({ name, data });
    }
  });

  const result = await service.scanAndQueueLiquidations([
    {
      marketId: "market-1",
      outcomeTokenId: "token-1",
      markPrice: 0.45
    }
  ]);

  assert.equal(result.queued, 0);
  assert.equal(queuedJobs.length, 0);
});

test("finalizes a queued liquidation and liquidates the position", async () => {
  const prisma = new FakeLiquidationPrisma();
  prisma.accounts.set("user-1", {
    id: "account-1",
    userId: "user-1",
    settledBalance: decimal("100"),
    usedMargin: decimal("5"),
    freeCollateral: decimal("95"),
    equity: decimal("100"),
    marginRatio: decimal("0.05"),
    totalUnrealizedPnl: decimal("0"),
    lastSyncedAt: null
  });
  prisma.positions.set("position-1", {
    id: "position-1",
    userId: "user-1",
    marketId: "market-1",
    outcomeTokenId: "token-1",
    side: "LONG",
    status: "LIQUIDATING",
    size: decimal("100"),
    notional: decimal("50"),
    leverage: decimal("10"),
    entryPrice: decimal("0.50"),
    markPrice: decimal("0.455"),
    liquidationPrice: decimal("0.455"),
    initialMargin: decimal("5"),
    maintenanceMargin: decimal("2.5"),
    unrealizedPnl: decimal("-4.5"),
    realizedPnl: decimal("0")
  });
  prisma.liquidations.set("liquidation-1", {
    id: "liquidation-1",
    userId: "user-1",
    positionId: "position-1",
    marketId: "market-1",
    markPrice: decimal("0.455"),
    liquidationPrice: decimal("0.455"),
    penalty: decimal("2.5"),
    status: "QUEUED"
  });

  const service = createLiquidationService(prisma, {
    async add() {}
  });

  await service.finalizeLiquidation("liquidation-1");

  const position = prisma.positions.get("position-1");
  const liquidation = prisma.liquidations.get("liquidation-1");

  assert.equal(position.status, "LIQUIDATED");
  assert.equal(position.size.toString(), "0");
  assert.equal(position.realizedPnl.toString(), "-4.5");
  assert.equal(liquidation.status, "SETTLED");
});
