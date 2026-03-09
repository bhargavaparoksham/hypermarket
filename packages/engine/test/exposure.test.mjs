import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";
import { createExposureService } from "../dist/services/exposure-service.js";

function decimal(value) {
  return new Decimal(value);
}

class FakeExposurePrisma {
  constructor() {
    this.positions = new Map();

    this.position = {
      findMany: async ({ where }) =>
        [...this.positions.values()].filter((position) => {
          if (!where.status.in.includes(position.status)) {
            return false;
          }

          if (where.marketId?.in && !where.marketId.in.includes(position.marketId)) {
            return false;
          }

          return true;
        })
    };
  }
}

test("aggregates active exposure by market and side", async () => {
  const prisma = new FakeExposurePrisma();
  prisma.positions.set("position-1", {
    id: "position-1",
    marketId: "market-a",
    outcomeTokenId: "yes-token",
    side: "LONG",
    status: "OPEN",
    size: decimal("10"),
    notional: decimal("6"),
    initialMargin: decimal("2"),
    maintenanceMargin: decimal("0.3"),
    unrealizedPnl: decimal("0.4")
  });
  prisma.positions.set("position-2", {
    id: "position-2",
    marketId: "market-a",
    outcomeTokenId: "no-token",
    side: "SHORT",
    status: "OPEN",
    size: decimal("5"),
    notional: decimal("2"),
    initialMargin: decimal("0.7"),
    maintenanceMargin: decimal("0.1"),
    unrealizedPnl: decimal("-0.2")
  });
  prisma.positions.set("position-3", {
    id: "position-3",
    marketId: "market-a",
    outcomeTokenId: "yes-token",
    side: "LONG",
    status: "CLOSING",
    size: decimal("4"),
    notional: decimal("1.8"),
    initialMargin: decimal("0.5"),
    maintenanceMargin: decimal("0.09"),
    unrealizedPnl: decimal("0.1")
  });
  prisma.positions.set("position-4", {
    id: "position-4",
    marketId: "market-b",
    outcomeTokenId: "yes-token",
    side: "SHORT",
    status: "LIQUIDATING",
    size: decimal("12"),
    notional: decimal("7.2"),
    initialMargin: decimal("1.8"),
    maintenanceMargin: decimal("0.36"),
    unrealizedPnl: decimal("-0.7")
  });
  prisma.positions.set("position-5", {
    id: "position-5",
    marketId: "market-b",
    outcomeTokenId: "yes-token",
    side: "LONG",
    status: "CLOSED",
    size: decimal("99"),
    notional: decimal("99"),
    initialMargin: decimal("99"),
    maintenanceMargin: decimal("99"),
    unrealizedPnl: decimal("99")
  });

  const service = createExposureService(prisma);
  const snapshot = await service.getExposureSnapshot();

  assert.equal(snapshot.markets.length, 2);

  const [marketA, marketB] = snapshot.markets;
  assert.equal(marketA.marketId, "market-a");
  assert.equal(marketA.activePositionCount, 3);
  assert.equal(marketA.long.positionCount, 2);
  assert.equal(marketA.long.size.toString(), "14");
  assert.equal(marketA.long.notional.toString(), "7.8");
  assert.equal(marketA.short.positionCount, 1);
  assert.equal(marketA.short.notional.toString(), "2");
  assert.equal(marketA.grossNotional.toString(), "9.8");
  assert.equal(marketA.netNotional.toString(), "5.8");
  assert.equal(marketA.netLongNotional.toString(), "5.8");
  assert.equal(marketA.netShortNotional.toString(), "0");
  assert.ok(
    marketA.hedgeThresholdInputs.imbalanceRatio
      .minus(decimal("0.59183673469387755102"))
      .abs()
      .lte(decimal("0.0000000000000000001"))
  );

  assert.equal(marketB.marketId, "market-b");
  assert.equal(marketB.activePositionCount, 1);
  assert.equal(marketB.long.notional.toString(), "0");
  assert.equal(marketB.short.notional.toString(), "7.2");
  assert.equal(marketB.netNotional.toString(), "-7.2");
  assert.equal(marketB.netLongNotional.toString(), "0");
  assert.equal(marketB.netShortNotional.toString(), "7.2");
  assert.equal(marketB.hedgeThresholdInputs.imbalanceRatio.toString(), "1");

  assert.equal(snapshot.totals.marketCount, 2);
  assert.equal(snapshot.totals.activePositionCount, 4);
  assert.equal(snapshot.totals.longNotional.toString(), "7.8");
  assert.equal(snapshot.totals.shortNotional.toString(), "9.2");
  assert.equal(snapshot.totals.grossNotional.toString(), "17");
  assert.equal(snapshot.totals.netNotional.toString(), "-1.4");
  assert.equal(snapshot.totals.netLongNotional.toString(), "5.8");
  assert.equal(snapshot.totals.netShortNotional.toString(), "7.2");
});

test("supports filtering exposure to a subset of markets", async () => {
  const prisma = new FakeExposurePrisma();
  prisma.positions.set("position-1", {
    id: "position-1",
    marketId: "market-a",
    outcomeTokenId: "yes-token",
    side: "LONG",
    status: "OPEN",
    size: decimal("10"),
    notional: decimal("5"),
    initialMargin: decimal("1"),
    maintenanceMargin: decimal("0.2"),
    unrealizedPnl: decimal("0.1")
  });
  prisma.positions.set("position-2", {
    id: "position-2",
    marketId: "market-b",
    outcomeTokenId: "yes-token",
    side: "SHORT",
    status: "OPEN",
    size: decimal("8"),
    notional: decimal("3"),
    initialMargin: decimal("0.8"),
    maintenanceMargin: decimal("0.15"),
    unrealizedPnl: decimal("-0.1")
  });

  const service = createExposureService(prisma);
  const snapshot = await service.getExposureSnapshot({
    marketIds: ["market-b"]
  });

  assert.equal(snapshot.markets.length, 1);
  assert.equal(snapshot.markets[0].marketId, "market-b");
  assert.equal(snapshot.totals.marketCount, 1);
  assert.equal(snapshot.totals.grossNotional.toString(), "3");
});

test("returns empty exposure totals when no active positions match", async () => {
  const prisma = new FakeExposurePrisma();
  prisma.positions.set("position-1", {
    id: "position-1",
    marketId: "market-a",
    outcomeTokenId: "yes-token",
    side: "LONG",
    status: "CLOSED",
    size: decimal("10"),
    notional: decimal("5"),
    initialMargin: decimal("1"),
    maintenanceMargin: decimal("0.2"),
    unrealizedPnl: decimal("0.1")
  });

  const service = createExposureService(prisma);
  const snapshot = await service.getExposureSnapshot();

  assert.deepEqual(snapshot.markets, []);
  assert.equal(snapshot.totals.marketCount, 0);
  assert.equal(snapshot.totals.activePositionCount, 0);
  assert.equal(snapshot.totals.longNotional.toString(), "0");
  assert.equal(snapshot.totals.shortNotional.toString(), "0");
  assert.equal(snapshot.totals.grossNotional.toString(), "0");
  assert.equal(snapshot.totals.netNotional.toString(), "0");
});
