import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createHedgeExecutionService
} from "../dist/services/hedge-execution-service.js";

function decimal(value) {
  return new Decimal(value);
}

function snapshot(markets) {
  return {
    markets,
    totals: {
      marketCount: markets.length,
      activePositionCount: 0,
      longNotional: decimal("0"),
      shortNotional: decimal("0"),
      grossNotional: decimal("0"),
      netNotional: decimal("0"),
      netLongNotional: decimal("0"),
      netShortNotional: decimal("0")
    }
  };
}

class FakeHedgeExecutionPrisma {
  constructor() {
    this.hedgeOrders = new Map();
    this.ids = 0;

    this.hedgeOrder = {
      findFirst: async ({ where }) =>
        [...this.hedgeOrders.values()].find((order) => {
          return (
            order.marketId === where.marketId &&
            where.status.in.includes(order.status)
          );
        }) ?? null,
      create: async ({ data }) => {
        const hedgeOrder = {
          id: this.nextId("hedge"),
          userId: data.userId ?? null,
          marketId: data.marketId,
          outcomeTokenId: data.outcomeTokenId ?? null,
          side: data.side,
          status: data.status,
          targetNotional: data.targetNotional,
          filledNotional: data.filledNotional,
          averageFillPrice: null,
          externalOrderId: null,
          errorMessage: null
        };
        this.hedgeOrders.set(hedgeOrder.id, hedgeOrder);
        return hedgeOrder;
      },
      update: async ({ where, data }) => {
        const hedgeOrder = this.hedgeOrders.get(where.id);
        if (!hedgeOrder) {
          throw new Error("hedge order not found");
        }

        Object.assign(hedgeOrder, data);
        return hedgeOrder;
      }
    };
  }

  nextId(prefix) {
    this.ids += 1;
    return `${prefix}-${this.ids}`;
  }
}

test("creates and fills a hedge when exposure breaches thresholds", async () => {
  const prisma = new FakeHedgeExecutionPrisma();
  const adapterCalls = [];
  const service = createHedgeExecutionService(
    prisma,
    {
      async executeHedge(input) {
        adapterCalls.push(input);
        return {
          status: "FILLED",
          filledNotional: input.targetNotional,
          averageFillPrice: "0.58",
          externalOrderId: "pm-order-1"
        };
      }
    },
    {
      defaultThresholds: {
        minNetNotional: "5",
        minImbalanceRatio: "0.4"
      }
    }
  );

  const result = await service.execute(
    snapshot([
      {
        marketId: "market-a",
        activePositionCount: 2,
        long: {
          positionCount: 1,
          size: decimal("10"),
          notional: decimal("9"),
          initialMargin: decimal("1"),
          maintenanceMargin: decimal("0.2"),
          unrealizedPnl: decimal("0.1")
        },
        short: {
          positionCount: 1,
          size: decimal("3"),
          notional: decimal("2"),
          initialMargin: decimal("0.3"),
          maintenanceMargin: decimal("0.1"),
          unrealizedPnl: decimal("-0.1")
        },
        grossNotional: decimal("11"),
        netNotional: decimal("7"),
        netLongNotional: decimal("7"),
        netShortNotional: decimal("0"),
        hedgeThresholdInputs: {
          grossNotional: decimal("11"),
          netNotional: decimal("7"),
          absoluteNetNotional: decimal("7"),
          netLongNotional: decimal("7"),
          netShortNotional: decimal("0"),
          imbalanceRatio: decimal("0.63636363636363636364")
        }
      }
    ])
  );

  assert.equal(result.evaluated, 1);
  assert.equal(result.candidates, 1);
  assert.equal(result.created, 1);
  assert.equal(result.filled, 1);
  assert.equal(result.failed, 0);
  assert.equal(adapterCalls.length, 1);
  assert.equal(adapterCalls[0].side, "SHORT");
  assert.equal(adapterCalls[0].targetNotional.toString(), "7");

  const [order] = prisma.hedgeOrders.values();
  assert.equal(order.status, "FILLED");
  assert.equal(order.side, "SHORT");
  assert.equal(order.targetNotional.toString(), "7");
  assert.equal(order.filledNotional.toString(), "7");
  assert.equal(order.averageFillPrice.toString(), "0.58");
  assert.equal(order.externalOrderId, "pm-order-1");
});

test("skips markets below threshold and caps target notional when configured", async () => {
  const prisma = new FakeHedgeExecutionPrisma();
  const service = createHedgeExecutionService(
    prisma,
    {
      async executeHedge(input) {
        return {
          status: "SUBMITTED",
          filledNotional: "0",
          externalOrderId: `ext-${input.marketId}`
        };
      }
    },
    {
      defaultThresholds: {
        minNetNotional: "5",
        minImbalanceRatio: "0.5",
        maxHedgeNotional: "6"
      }
    }
  );

  const result = await service.execute(
    snapshot([
      {
        marketId: "market-a",
        activePositionCount: 1,
        long: {
          positionCount: 1,
          size: decimal("10"),
          notional: decimal("8"),
          initialMargin: decimal("1"),
          maintenanceMargin: decimal("0.2"),
          unrealizedPnl: decimal("0")
        },
        short: {
          positionCount: 0,
          size: decimal("0"),
          notional: decimal("0"),
          initialMargin: decimal("0"),
          maintenanceMargin: decimal("0"),
          unrealizedPnl: decimal("0")
        },
        grossNotional: decimal("8"),
        netNotional: decimal("8"),
        netLongNotional: decimal("8"),
        netShortNotional: decimal("0"),
        hedgeThresholdInputs: {
          grossNotional: decimal("8"),
          netNotional: decimal("8"),
          absoluteNetNotional: decimal("8"),
          netLongNotional: decimal("8"),
          netShortNotional: decimal("0"),
          imbalanceRatio: decimal("1")
        }
      },
      {
        marketId: "market-b",
        activePositionCount: 2,
        long: {
          positionCount: 1,
          size: decimal("5"),
          notional: decimal("4"),
          initialMargin: decimal("1"),
          maintenanceMargin: decimal("0.2"),
          unrealizedPnl: decimal("0")
        },
        short: {
          positionCount: 1,
          size: decimal("2"),
          notional: decimal("1"),
          initialMargin: decimal("0.2"),
          maintenanceMargin: decimal("0.1"),
          unrealizedPnl: decimal("0")
        },
        grossNotional: decimal("5"),
        netNotional: decimal("3"),
        netLongNotional: decimal("3"),
        netShortNotional: decimal("0"),
        hedgeThresholdInputs: {
          grossNotional: decimal("5"),
          netNotional: decimal("3"),
          absoluteNetNotional: decimal("3"),
          netLongNotional: decimal("3"),
          netShortNotional: decimal("0"),
          imbalanceRatio: decimal("0.6")
        }
      }
    ])
  );

  assert.equal(result.evaluated, 2);
  assert.equal(result.candidates, 1);
  assert.equal(result.created, 1);
  assert.equal(result.submitted, 1);
  assert.equal(result.skipped, 1);

  const [order] = prisma.hedgeOrders.values();
  assert.equal(order.targetNotional.toString(), "6");
  assert.equal(order.status, "SUBMITTED");
});

test("deduplicates when an open hedge order already exists for the market", async () => {
  const prisma = new FakeHedgeExecutionPrisma();
  prisma.hedgeOrders.set("hedge-existing", {
    id: "hedge-existing",
    userId: null,
    marketId: "market-a",
    outcomeTokenId: null,
    side: "SHORT",
    status: "SUBMITTED",
    targetNotional: decimal("5"),
    filledNotional: decimal("0"),
    averageFillPrice: null,
    externalOrderId: "pm-order-1",
    errorMessage: null
  });

  const service = createHedgeExecutionService(
    prisma,
    {
      async executeHedge() {
        throw new Error("should not execute");
      }
    },
    {
      defaultThresholds: {
        minNetNotional: "5",
        minImbalanceRatio: "0.4"
      }
    }
  );

  const result = await service.execute(
    snapshot([
      {
        marketId: "market-a",
        activePositionCount: 1,
        long: {
          positionCount: 1,
          size: decimal("10"),
          notional: decimal("9"),
          initialMargin: decimal("1"),
          maintenanceMargin: decimal("0.2"),
          unrealizedPnl: decimal("0")
        },
        short: {
          positionCount: 0,
          size: decimal("0"),
          notional: decimal("0"),
          initialMargin: decimal("0"),
          maintenanceMargin: decimal("0"),
          unrealizedPnl: decimal("0")
        },
        grossNotional: decimal("9"),
        netNotional: decimal("9"),
        netLongNotional: decimal("9"),
        netShortNotional: decimal("0"),
        hedgeThresholdInputs: {
          grossNotional: decimal("9"),
          netNotional: decimal("9"),
          absoluteNetNotional: decimal("9"),
          netLongNotional: decimal("9"),
          netShortNotional: decimal("0"),
          imbalanceRatio: decimal("1")
        }
      }
    ])
  );

  assert.equal(result.created, 0);
  assert.equal(result.skipped, 1);
  assert.equal(prisma.hedgeOrders.size, 1);
});

test("marks hedge orders failed when adapter throws", async () => {
  const prisma = new FakeHedgeExecutionPrisma();
  const service = createHedgeExecutionService(
    prisma,
    {
      async executeHedge() {
        throw new Error("execution adapter unavailable");
      }
    },
    {
      defaultThresholds: {
        minNetNotional: "1",
        minImbalanceRatio: "0.1"
      }
    }
  );

  const result = await service.execute(
    snapshot([
      {
        marketId: "market-a",
        activePositionCount: 1,
        long: {
          positionCount: 0,
          size: decimal("0"),
          notional: decimal("0"),
          initialMargin: decimal("0"),
          maintenanceMargin: decimal("0"),
          unrealizedPnl: decimal("0")
        },
        short: {
          positionCount: 1,
          size: decimal("10"),
          notional: decimal("4"),
          initialMargin: decimal("1"),
          maintenanceMargin: decimal("0.2"),
          unrealizedPnl: decimal("0")
        },
        grossNotional: decimal("4"),
        netNotional: decimal("-4"),
        netLongNotional: decimal("0"),
        netShortNotional: decimal("4"),
        hedgeThresholdInputs: {
          grossNotional: decimal("4"),
          netNotional: decimal("-4"),
          absoluteNetNotional: decimal("4"),
          netLongNotional: decimal("0"),
          netShortNotional: decimal("4"),
          imbalanceRatio: decimal("1")
        }
      }
    ])
  );

  assert.equal(result.created, 1);
  assert.equal(result.failed, 1);

  const [order] = prisma.hedgeOrders.values();
  assert.equal(order.status, "FAILED");
  assert.equal(order.side, "LONG");
  assert.equal(order.errorMessage, "execution adapter unavailable");
});
