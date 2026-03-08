-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'LIQUIDATING', 'LIQUIDATED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "LiquidationStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "HedgeOrderStatus" AS ENUM ('PENDING', 'SUBMITTED', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarginAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "settledBalance" DECIMAL(20,6) NOT NULL,
    "usedMargin" DECIMAL(20,6) NOT NULL,
    "freeCollateral" DECIMAL(20,6) NOT NULL,
    "equity" DECIMAL(20,6) NOT NULL,
    "marginRatio" DECIMAL(20,8) NOT NULL,
    "totalUnrealizedPnl" DECIMAL(20,6) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarginAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcomeTokenId" TEXT,
    "side" "PositionSide" NOT NULL,
    "status" "PositionStatus" NOT NULL,
    "size" DECIMAL(20,6) NOT NULL,
    "notional" DECIMAL(20,6) NOT NULL,
    "leverage" DECIMAL(8,4) NOT NULL,
    "entryPrice" DECIMAL(12,6) NOT NULL,
    "markPrice" DECIMAL(12,6) NOT NULL,
    "liquidationPrice" DECIMAL(12,6) NOT NULL,
    "initialMargin" DECIMAL(20,6) NOT NULL,
    "maintenanceMargin" DECIMAL(20,6) NOT NULL,
    "unrealizedPnl" DECIMAL(20,6) NOT NULL,
    "realizedPnl" DECIMAL(20,6) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT,
    "amount" DECIMAL(20,6) NOT NULL,
    "pnl" DECIMAL(20,6) NOT NULL,
    "status" "SettlementStatus" NOT NULL,
    "direction" TEXT NOT NULL,
    "transactionHash" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "markPrice" DECIMAL(12,6) NOT NULL,
    "liquidationPrice" DECIMAL(12,6) NOT NULL,
    "penalty" DECIMAL(20,6) NOT NULL,
    "status" "LiquidationStatus" NOT NULL,
    "reason" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liquidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HedgeOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "marketId" TEXT NOT NULL,
    "outcomeTokenId" TEXT,
    "side" "PositionSide" NOT NULL,
    "status" "HedgeOrderStatus" NOT NULL,
    "targetNotional" DECIMAL(20,6) NOT NULL,
    "filledNotional" DECIMAL(20,6) NOT NULL,
    "averageFillPrice" DECIMAL(12,6),
    "externalOrderId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HedgeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "MarginAccount_userId_key" ON "MarginAccount"("userId");

-- CreateIndex
CREATE INDEX "Position_userId_status_idx" ON "Position"("userId", "status");

-- CreateIndex
CREATE INDEX "Position_marketId_status_idx" ON "Position"("marketId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_transactionHash_key" ON "Settlement"("transactionHash");

-- CreateIndex
CREATE INDEX "Settlement_userId_status_idx" ON "Settlement"("userId", "status");

-- CreateIndex
CREATE INDEX "Liquidation_userId_status_idx" ON "Liquidation"("userId", "status");

-- CreateIndex
CREATE INDEX "Liquidation_positionId_idx" ON "Liquidation"("positionId");

-- CreateIndex
CREATE INDEX "HedgeOrder_marketId_status_idx" ON "HedgeOrder"("marketId", "status");

-- AddForeignKey
ALTER TABLE "MarginAccount" ADD CONSTRAINT "MarginAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HedgeOrder" ADD CONSTRAINT "HedgeOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
