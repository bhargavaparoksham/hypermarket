import { Logger } from "../logger.js";
import {
  HedgeExecutionAdapter,
  HedgeExecutionResult
} from "./hedge-execution-service.js";
import { Decimal } from "@prisma/client/runtime/library";

interface CreatePolymarketHedgeClientOptions {
  executionUrl: string | null;
  apiKey?: string | null;
  dryRun?: boolean;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

interface HedgeProxyResponse {
  status?: unknown;
  orderId?: unknown;
  filledNotional?: unknown;
  averageFillPrice?: unknown;
  errorMessage?: unknown;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toDecimalStringOrUndefined(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
}

function normalizeExecutionStatus(status: unknown): HedgeExecutionResult["status"] {
  if (
    status === "SUBMITTED" ||
    status === "FILLED" ||
    status === "PARTIALLY_FILLED" ||
    status === "FAILED"
  ) {
    return status;
  }

  return "FAILED";
}

export function createPolymarketHedgeClient(
  options: CreatePolymarketHedgeClientOptions
): HedgeExecutionAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async executeHedge(input) {
      if (options.dryRun ?? true) {
        const externalOrderId = `dry-run:${input.marketId}:${input.outcomeTokenId}:${Date.now()}`;
        options.logger.info("Dry-run hedge execution requested", {
          marketId: input.marketId,
          outcomeTokenId: input.outcomeTokenId,
          side: input.side,
          targetNotional: input.targetNotional.toString(),
          externalOrderId
        });

        return {
          status: "SUBMITTED",
          filledNotional: new Decimal("0"),
          externalOrderId
        };
      }

      if (!options.executionUrl) {
        throw new Error(
          "POLYMARKET_HEDGE_PROXY_URL is required when hedge dry-run mode is disabled"
        );
      }

      const requestUrl = new URL("/hedge", options.executionUrl);
      const response = await fetchImpl(requestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.apiKey
            ? {
                authorization: `Bearer ${options.apiKey}`
              }
            : {})
        },
        body: JSON.stringify({
          marketId: input.marketId,
          outcomeTokenId: input.outcomeTokenId,
          side: input.side,
          targetNotional: input.targetNotional.toString()
        })
      });

      if (!response.ok) {
        throw new Error(
          `Polymarket hedge proxy request failed with status ${response.status}`
        );
      }

      const payload = (await response.json()) as HedgeProxyResponse;
      const status = normalizeExecutionStatus(payload.status);

      return {
        status,
        filledNotional: toDecimalStringOrUndefined(payload.filledNotional),
        averageFillPrice: toDecimalStringOrUndefined(payload.averageFillPrice),
        externalOrderId: toStringOrNull(payload.orderId),
        errorMessage: toStringOrNull(payload.errorMessage)
      };
    }
  };
}
