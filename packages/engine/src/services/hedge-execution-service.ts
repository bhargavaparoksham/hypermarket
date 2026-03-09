import { Decimal } from "@prisma/client/runtime/library";
import {
  ExposureSnapshot,
  MarketExposureSummary
} from "./exposure-service.js";
import { DECIMAL_ZERO, toDecimal, type DecimalValue } from "./decimal.js";
import { PositionSide } from "./position-service.js";

type HedgeOrderStatus =
  | "PENDING"
  | "SUBMITTED"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "CANCELLED"
  | "FAILED";

interface HedgeOrderRecord {
  id: string;
  marketId: string;
  outcomeTokenId: string | null;
  side: PositionSide;
  status: HedgeOrderStatus;
  targetNotional: Decimal;
  filledNotional: Decimal;
  averageFillPrice: Decimal | null;
  externalOrderId: string | null;
  errorMessage: string | null;
}

interface HedgeOrderDelegate {
  findFirst(args: {
    where: {
      marketId: string;
      status: { in: readonly HedgeOrderStatus[] };
    };
  }): Promise<HedgeOrderRecord | null>;
  create(args: {
    data: {
      userId?: string | null;
      marketId: string;
      outcomeTokenId?: string | null;
      side: PositionSide;
      status: HedgeOrderStatus;
      targetNotional: Decimal;
      filledNotional: Decimal;
    };
  }): Promise<HedgeOrderRecord>;
  update(args: {
    where: { id: string };
    data: {
      status?: HedgeOrderStatus;
      filledNotional?: Decimal;
      averageFillPrice?: Decimal | null;
      externalOrderId?: string | null;
      errorMessage?: string | null;
    };
  }): Promise<HedgeOrderRecord>;
}

export interface HedgeExecutionPrismaLike {
  hedgeOrder: HedgeOrderDelegate;
}

export interface HedgeThresholdPolicy {
  minNetNotional: Decimal;
  minImbalanceRatio: Decimal;
  maxHedgeNotional: Decimal | null;
}

export interface HedgeCandidate {
  marketId: string;
  side: PositionSide;
  targetNotional: Decimal;
  exposure: MarketExposureSummary;
  thresholdPolicy: HedgeThresholdPolicy;
}

export interface HedgeExecutionResult {
  status: "SUBMITTED" | "FILLED" | "PARTIALLY_FILLED" | "FAILED";
  filledNotional?: DecimalValue;
  averageFillPrice?: DecimalValue | null;
  externalOrderId?: string | null;
  errorMessage?: string | null;
}

export interface HedgeExecutionAdapter {
  executeHedge(input: {
    marketId: string;
    side: PositionSide;
    targetNotional: Decimal;
  }): Promise<HedgeExecutionResult>;
}

export interface HedgeExecutionSummary {
  evaluated: number;
  candidates: number;
  created: number;
  submitted: number;
  filled: number;
  partial: number;
  failed: number;
  skipped: number;
}

export interface HedgeExecutionService {
  buildHedgeCandidates(snapshot: ExposureSnapshot): HedgeCandidate[];
  execute(snapshot: ExposureSnapshot): Promise<HedgeExecutionSummary>;
}

const OPEN_HEDGE_STATUSES = ["PENDING", "SUBMITTED", "PARTIALLY_FILLED"] as const;

function normalizeThresholdPolicy(policy: {
  minNetNotional: DecimalValue;
  minImbalanceRatio: DecimalValue;
  maxHedgeNotional?: DecimalValue | null;
}): HedgeThresholdPolicy {
  return {
    minNetNotional: toDecimal(policy.minNetNotional),
    minImbalanceRatio: toDecimal(policy.minImbalanceRatio),
    maxHedgeNotional:
      policy.maxHedgeNotional === undefined || policy.maxHedgeNotional === null
        ? null
        : toDecimal(policy.maxHedgeNotional)
  };
}

function targetSideForExposure(exposure: MarketExposureSummary): PositionSide | null {
  if (exposure.netLongNotional.greaterThan(DECIMAL_ZERO)) {
    return "SHORT";
  }

  if (exposure.netShortNotional.greaterThan(DECIMAL_ZERO)) {
    return "LONG";
  }

  return null;
}

function targetNotionalForExposure(
  exposure: MarketExposureSummary,
  thresholdPolicy: HedgeThresholdPolicy
): Decimal {
  const uncapped = exposure.hedgeThresholdInputs.absoluteNetNotional;

  if (
    thresholdPolicy.maxHedgeNotional &&
    uncapped.greaterThan(thresholdPolicy.maxHedgeNotional)
  ) {
    return thresholdPolicy.maxHedgeNotional;
  }

  return uncapped;
}

function executionStatusCounts(
  summary: HedgeExecutionSummary,
  status: HedgeExecutionResult["status"]
): HedgeExecutionSummary {
  if (status === "SUBMITTED") {
    return { ...summary, submitted: summary.submitted + 1 };
  }

  if (status === "FILLED") {
    return { ...summary, filled: summary.filled + 1 };
  }

  if (status === "PARTIALLY_FILLED") {
    return { ...summary, partial: summary.partial + 1 };
  }

  return { ...summary, failed: summary.failed + 1 };
}

export function createHedgeExecutionService(
  prisma: HedgeExecutionPrismaLike,
  adapter: HedgeExecutionAdapter,
  options?: {
    defaultThresholds?: {
      minNetNotional: DecimalValue;
      minImbalanceRatio: DecimalValue;
      maxHedgeNotional?: DecimalValue | null;
    };
    getThresholdPolicy?: (
      exposure: MarketExposureSummary
    ) => {
      minNetNotional: DecimalValue;
      minImbalanceRatio: DecimalValue;
      maxHedgeNotional?: DecimalValue | null;
    };
  }
): HedgeExecutionService {
  const defaultThresholds = normalizeThresholdPolicy(
    options?.defaultThresholds ?? {
      minNetNotional: "250",
      minImbalanceRatio: "0.25"
    }
  );

  function resolveThresholdPolicy(
    exposure: MarketExposureSummary
  ): HedgeThresholdPolicy {
    if (!options?.getThresholdPolicy) {
      return defaultThresholds;
    }

    return normalizeThresholdPolicy(options.getThresholdPolicy(exposure));
  }

  return {
    buildHedgeCandidates(snapshot) {
      return snapshot.markets.flatMap((exposure) => {
        const thresholdPolicy = resolveThresholdPolicy(exposure);
        const absoluteNet = exposure.hedgeThresholdInputs.absoluteNetNotional;
        const imbalanceRatio = exposure.hedgeThresholdInputs.imbalanceRatio;

        if (
          absoluteNet.lessThan(thresholdPolicy.minNetNotional) ||
          imbalanceRatio.lessThan(thresholdPolicy.minImbalanceRatio)
        ) {
          return [];
        }

        const side = targetSideForExposure(exposure);
        if (!side) {
          return [];
        }

        const targetNotional = targetNotionalForExposure(
          exposure,
          thresholdPolicy
        );

        if (!targetNotional.greaterThan(DECIMAL_ZERO)) {
          return [];
        }

        return [
          {
            marketId: exposure.marketId,
            side,
            targetNotional,
            exposure,
            thresholdPolicy
          }
        ];
      });
    },

    async execute(snapshot) {
      const candidates = this.buildHedgeCandidates(snapshot);
      let summary: HedgeExecutionSummary = {
        evaluated: snapshot.markets.length,
        candidates: candidates.length,
        created: 0,
        submitted: 0,
        filled: 0,
        partial: 0,
        failed: 0,
        skipped: snapshot.markets.length - candidates.length
      };

      for (const candidate of candidates) {
        const existing = await prisma.hedgeOrder.findFirst({
          where: {
            marketId: candidate.marketId,
            status: {
              in: [...OPEN_HEDGE_STATUSES]
            }
          }
        });

        if (existing) {
          summary = {
            ...summary,
            skipped: summary.skipped + 1
          };
          continue;
        }

        const hedgeOrder = await prisma.hedgeOrder.create({
          data: {
            marketId: candidate.marketId,
            outcomeTokenId: null,
            side: candidate.side,
            status: "PENDING",
            targetNotional: candidate.targetNotional,
            filledNotional: DECIMAL_ZERO
          }
        });
        summary = {
          ...summary,
          created: summary.created + 1
        };

        try {
          const result = await adapter.executeHedge({
            marketId: candidate.marketId,
            side: candidate.side,
            targetNotional: candidate.targetNotional
          });

          await prisma.hedgeOrder.update({
            where: {
              id: hedgeOrder.id
            },
            data: {
              status: result.status,
              filledNotional:
                result.filledNotional === undefined
                  ? DECIMAL_ZERO
                  : toDecimal(result.filledNotional),
              averageFillPrice:
                result.averageFillPrice === undefined
                  ? null
                  : result.averageFillPrice === null
                    ? null
                    : toDecimal(result.averageFillPrice),
              externalOrderId: result.externalOrderId ?? null,
              errorMessage: result.errorMessage ?? null
            }
          });

          summary = executionStatusCounts(summary, result.status);
        } catch (error) {
          await prisma.hedgeOrder.update({
            where: {
              id: hedgeOrder.id
            },
            data: {
              status: "FAILED",
              errorMessage:
                error instanceof Error ? error.message : "Unknown hedge execution error"
            }
          });

          summary = {
            ...summary,
            failed: summary.failed + 1
          };
        }
      }

      return summary;
    }
  };
}
