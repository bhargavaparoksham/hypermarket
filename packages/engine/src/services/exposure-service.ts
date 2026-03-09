import { Decimal } from "@prisma/client/runtime/library";
import { DECIMAL_ZERO } from "./decimal.js";
import { PositionSide, PositionStatus } from "./position-service.js";

const ACTIVE_POSITION_STATUSES = ["OPEN", "CLOSING", "LIQUIDATING"] as const satisfies readonly PositionStatus[];

interface StoredExposurePosition {
  id: string;
  marketId: string;
  outcomeTokenId: string | null;
  side: PositionSide;
  status: PositionStatus;
  size: Decimal;
  notional: Decimal;
  initialMargin: Decimal;
  maintenanceMargin: Decimal;
  unrealizedPnl: Decimal;
}

interface PositionDelegate {
  findMany(args: {
    where: {
      status: { in: readonly PositionStatus[] };
      marketId?: { in: string[] };
    };
  }): Promise<StoredExposurePosition[]>;
}

export interface ExposurePrismaLike {
  position: PositionDelegate;
}

export interface ExposureSideMetrics {
  positionCount: number;
  size: Decimal;
  notional: Decimal;
  initialMargin: Decimal;
  maintenanceMargin: Decimal;
  unrealizedPnl: Decimal;
}

export interface HedgeThresholdInputs {
  grossNotional: Decimal;
  netNotional: Decimal;
  absoluteNetNotional: Decimal;
  netLongNotional: Decimal;
  netShortNotional: Decimal;
  imbalanceRatio: Decimal;
}

export interface MarketExposureSummary {
  marketId: string;
  activePositionCount: number;
  long: ExposureSideMetrics;
  short: ExposureSideMetrics;
  grossNotional: Decimal;
  netNotional: Decimal;
  netLongNotional: Decimal;
  netShortNotional: Decimal;
  hedgeThresholdInputs: HedgeThresholdInputs;
}

export interface ExposureTotals {
  marketCount: number;
  activePositionCount: number;
  longNotional: Decimal;
  shortNotional: Decimal;
  grossNotional: Decimal;
  netNotional: Decimal;
  netLongNotional: Decimal;
  netShortNotional: Decimal;
}

export interface ExposureSnapshot {
  markets: MarketExposureSummary[];
  totals: ExposureTotals;
}

export interface ExposureService {
  getExposureSnapshot(input?: { marketIds?: string[] }): Promise<ExposureSnapshot>;
}

function createEmptySideMetrics(): ExposureSideMetrics {
  return {
    positionCount: 0,
    size: DECIMAL_ZERO,
    notional: DECIMAL_ZERO,
    initialMargin: DECIMAL_ZERO,
    maintenanceMargin: DECIMAL_ZERO,
    unrealizedPnl: DECIMAL_ZERO
  };
}

function toSideMetrics(position: StoredExposurePosition): ExposureSideMetrics {
  return {
    positionCount: 1,
    size: position.size,
    notional: position.notional,
    initialMargin: position.initialMargin,
    maintenanceMargin: position.maintenanceMargin,
    unrealizedPnl: position.unrealizedPnl
  };
}

function addSideMetrics(
  left: ExposureSideMetrics,
  right: ExposureSideMetrics
): ExposureSideMetrics {
  return {
    positionCount: left.positionCount + right.positionCount,
    size: left.size.plus(right.size),
    notional: left.notional.plus(right.notional),
    initialMargin: left.initialMargin.plus(right.initialMargin),
    maintenanceMargin: left.maintenanceMargin.plus(right.maintenanceMargin),
    unrealizedPnl: left.unrealizedPnl.plus(right.unrealizedPnl)
  };
}

function calculateNetLongNotional(
  longNotional: Decimal,
  shortNotional: Decimal
): Decimal {
  return longNotional.greaterThan(shortNotional)
    ? longNotional.minus(shortNotional)
    : DECIMAL_ZERO;
}

function calculateNetShortNotional(
  longNotional: Decimal,
  shortNotional: Decimal
): Decimal {
  return shortNotional.greaterThan(longNotional)
    ? shortNotional.minus(longNotional)
    : DECIMAL_ZERO;
}

function buildThresholdInputs(
  longNotional: Decimal,
  shortNotional: Decimal
): HedgeThresholdInputs {
  const grossNotional = longNotional.plus(shortNotional);
  const netNotional = longNotional.minus(shortNotional);
  const absoluteNetNotional = netNotional.abs();

  return {
    grossNotional,
    netNotional,
    absoluteNetNotional,
    netLongNotional: calculateNetLongNotional(longNotional, shortNotional),
    netShortNotional: calculateNetShortNotional(longNotional, shortNotional),
    imbalanceRatio: grossNotional.greaterThan(DECIMAL_ZERO)
      ? absoluteNetNotional.div(grossNotional)
      : DECIMAL_ZERO
  };
}

function buildMarketExposureSummary(
  marketId: string,
  long: ExposureSideMetrics,
  short: ExposureSideMetrics
): MarketExposureSummary {
  const hedgeThresholdInputs = buildThresholdInputs(long.notional, short.notional);

  return {
    marketId,
    activePositionCount: long.positionCount + short.positionCount,
    long,
    short,
    grossNotional: hedgeThresholdInputs.grossNotional,
    netNotional: hedgeThresholdInputs.netNotional,
    netLongNotional: hedgeThresholdInputs.netLongNotional,
    netShortNotional: hedgeThresholdInputs.netShortNotional,
    hedgeThresholdInputs
  };
}

export function createExposureService(prisma: ExposurePrismaLike): ExposureService {
  return {
    async getExposureSnapshot(input = {}) {
      const positions = await prisma.position.findMany({
        where: {
          status: {
            in: [...ACTIVE_POSITION_STATUSES]
          },
          ...(input.marketIds?.length
            ? {
                marketId: {
                  in: input.marketIds
                }
              }
            : {})
        }
      });

      const exposureByMarket = new Map<
        string,
        { long: ExposureSideMetrics; short: ExposureSideMetrics }
      >();

      for (const position of positions) {
        const existing = exposureByMarket.get(position.marketId) ?? {
          long: createEmptySideMetrics(),
          short: createEmptySideMetrics()
        };
        const nextMetrics = addSideMetrics(
          position.side === "LONG" ? existing.long : existing.short,
          toSideMetrics(position)
        );

        exposureByMarket.set(position.marketId, {
          long: position.side === "LONG" ? nextMetrics : existing.long,
          short: position.side === "SHORT" ? nextMetrics : existing.short
        });
      }

      const markets = [...exposureByMarket.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([marketId, summary]) =>
          buildMarketExposureSummary(marketId, summary.long, summary.short)
        );

      const totals = markets.reduce<ExposureTotals>(
        (aggregate, market) => ({
          marketCount: aggregate.marketCount + 1,
          activePositionCount:
            aggregate.activePositionCount + market.activePositionCount,
          longNotional: aggregate.longNotional.plus(market.long.notional),
          shortNotional: aggregate.shortNotional.plus(market.short.notional),
          grossNotional: aggregate.grossNotional.plus(market.grossNotional),
          netNotional: aggregate.netNotional.plus(market.netNotional),
          netLongNotional: aggregate.netLongNotional.plus(market.netLongNotional),
          netShortNotional: aggregate.netShortNotional.plus(market.netShortNotional)
        }),
        {
          marketCount: 0,
          activePositionCount: 0,
          longNotional: DECIMAL_ZERO,
          shortNotional: DECIMAL_ZERO,
          grossNotional: DECIMAL_ZERO,
          netNotional: DECIMAL_ZERO,
          netLongNotional: DECIMAL_ZERO,
          netShortNotional: DECIMAL_ZERO
        }
      );

      return {
        markets,
        totals
      };
    }
  };
}
