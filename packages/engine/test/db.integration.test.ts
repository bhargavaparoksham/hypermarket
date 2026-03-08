import test from "node:test";
import assert from "node:assert/strict";
import prismaClientPkg from "@prisma/client";

const { PrismaClient, Prisma } = prismaClientPkg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for db integration tests");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl
    }
  }
});

function randomWallet(seed: string): string {
  const suffix = Buffer.from(seed).toString("hex").slice(0, 40).padEnd(40, "0");
  return `0x${suffix}`;
}

async function resetDatabase(): Promise<void> {
  await prisma.liquidation.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.hedgeOrder.deleteMany();
  await prisma.position.deleteMany();
  await prisma.marginAccount.deleteMany();
  await prisma.user.deleteMany();
}

test.before(async () => {
  await prisma.$connect();
});

test.after(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

test("creates user and margin account ledger state", async () => {
  await resetDatabase();

  const walletAddress = randomWallet("user-account");

  const user = await prisma.user.create({
    data: {
      walletAddress,
      marginAccount: {
        create: {
          settledBalance: new Prisma.Decimal("1000.000000"),
          usedMargin: new Prisma.Decimal("250.000000"),
          freeCollateral: new Prisma.Decimal("750.000000"),
          equity: new Prisma.Decimal("1020.000000"),
          marginRatio: new Prisma.Decimal("0.25000000"),
          totalUnrealizedPnl: new Prisma.Decimal("20.000000")
        }
      }
    },
    include: {
      marginAccount: true
    }
  });

  assert.equal(user.walletAddress, walletAddress);
  assert.ok(user.marginAccount);
  assert.equal(user.marginAccount?.settledBalance.toString(), "1000");
  assert.equal(user.marginAccount?.totalUnrealizedPnl.toString(), "20");
});

test("persists a full position lifecycle", async () => {
  await resetDatabase();

  const user = await prisma.user.create({
    data: {
      walletAddress: randomWallet("position-user")
    }
  });

  const position = await prisma.position.create({
    data: {
      userId: user.id,
      marketId: "pres-2028-winner",
      outcomeTokenId: "yes-token",
      side: "LONG",
      status: "OPEN",
      size: new Prisma.Decimal("100.000000"),
      notional: new Prisma.Decimal("55.000000"),
      leverage: new Prisma.Decimal("5.0000"),
      entryPrice: new Prisma.Decimal("0.550000"),
      markPrice: new Prisma.Decimal("0.560000"),
      liquidationPrice: new Prisma.Decimal("0.455000"),
      initialMargin: new Prisma.Decimal("11.000000"),
      maintenanceMargin: new Prisma.Decimal("2.750000"),
      unrealizedPnl: new Prisma.Decimal("1.000000"),
      realizedPnl: new Prisma.Decimal("0.000000")
    }
  });

  const updated = await prisma.position.update({
    where: { id: position.id },
    data: {
      status: "CLOSED",
      realizedPnl: new Prisma.Decimal("2.500000"),
      unrealizedPnl: new Prisma.Decimal("0.000000"),
      closedAt: new Date()
    }
  });

  assert.equal(updated.status, "CLOSED");
  assert.equal(updated.realizedPnl.toString(), "2.5");
});

test("enforces settlement transaction hash uniqueness", async () => {
  await resetDatabase();

  const user = await prisma.user.create({
    data: {
      walletAddress: randomWallet("settlement-user")
    }
  });

  const transactionHash =
    "0x1111111111111111111111111111111111111111111111111111111111111111";

  await prisma.settlement.create({
    data: {
      userId: user.id,
      amount: new Prisma.Decimal("25.000000"),
      pnl: new Prisma.Decimal("25.000000"),
      status: "CONFIRMED",
      direction: "CREDIT",
      transactionHash
    }
  });

  await assert.rejects(
    prisma.settlement.create({
      data: {
        userId: user.id,
        amount: new Prisma.Decimal("10.000000"),
        pnl: new Prisma.Decimal("10.000000"),
        status: "CONFIRMED",
        direction: "CREDIT",
        transactionHash
      }
    }),
    (error: unknown) => {
      return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      );
    }
  );
});

test("enforces liquidation foreign key integrity", async () => {
  await resetDatabase();

  const user = await prisma.user.create({
    data: {
      walletAddress: randomWallet("liquidation-user")
    }
  });

  await assert.rejects(
    prisma.liquidation.create({
      data: {
        userId: user.id,
        positionId: "missing-position",
        marketId: "pres-2028-winner",
        markPrice: new Prisma.Decimal("0.455000"),
        liquidationPrice: new Prisma.Decimal("0.455000"),
        penalty: new Prisma.Decimal("5.000000"),
        status: "QUEUED"
      }
    }),
    (error: unknown) => {
      return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      );
    }
  );
});

test("supports hedge order status transitions", async () => {
  await resetDatabase();

  const user = await prisma.user.create({
    data: {
      walletAddress: randomWallet("hedge-user")
    }
  });

  const hedgeOrder = await prisma.hedgeOrder.create({
    data: {
      userId: user.id,
      marketId: "pres-2028-winner",
      outcomeTokenId: "yes-token",
      side: "SHORT",
      status: "PENDING",
      targetNotional: new Prisma.Decimal("100.000000"),
      filledNotional: new Prisma.Decimal("0.000000")
    }
  });

  const updated = await prisma.hedgeOrder.update({
    where: { id: hedgeOrder.id },
    data: {
      status: "FILLED",
      filledNotional: new Prisma.Decimal("100.000000"),
      averageFillPrice: new Prisma.Decimal("0.520000"),
      externalOrderId: "pm-order-1"
    }
  });

  assert.equal(updated.status, "FILLED");
  assert.equal(updated.filledNotional.toString(), "100");
  assert.equal(updated.averageFillPrice?.toString(), "0.52");
});
