import { MARKET_PRICE_DEFAULTS } from "@hypermarket/shared";
import { WriteMarketPriceSnapshot } from "./price-store.js";

interface ExistingPriceState {
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  markPrice?: number | null;
}

interface PriceEventState {
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
}

function isValidBinaryPrice(value: number | null): value is number {
  return value !== null && value >= 0 && value <= 1;
}

function calculateMidpoint(
  bestBid: number | null,
  bestAsk: number | null
): number | null {
  if (!isValidBinaryPrice(bestBid) || !isValidBinaryPrice(bestAsk)) {
    return null;
  }

  if (bestBid > bestAsk) {
    return null;
  }

  const spread = bestAsk - bestBid;
  if (spread > MARKET_PRICE_DEFAULTS.maxMidpointSpread) {
    return null;
  }

  return (bestBid + bestAsk) / 2;
}

function clampMarkPrice(candidate: number, previousMarkPrice: number | null): number {
  if (!isValidBinaryPrice(previousMarkPrice)) {
    return candidate;
  }

  const delta = candidate - previousMarkPrice;
  if (Math.abs(delta) <= MARKET_PRICE_DEFAULTS.maxMarkPriceJump) {
    return candidate;
  }

  const direction = Math.sign(delta) || 1;
  const clamped = previousMarkPrice +
    direction * MARKET_PRICE_DEFAULTS.maxMarkPriceJump;

  return Math.max(0, Math.min(1, clamped));
}

export function applyMarkPricePolicy(
  existingSnapshot: ExistingPriceState | null,
  event: PriceEventState
): Pick<
  WriteMarketPriceSnapshot,
  "bestBid" | "bestAsk" | "midpoint" | "markPrice" | "lastTradePrice"
> {
  const bestBid = event.bestBid ?? existingSnapshot?.bestBid ?? null;
  const bestAsk = event.bestAsk ?? existingSnapshot?.bestAsk ?? null;
  const lastTradePrice =
    event.lastTradePrice ?? existingSnapshot?.lastTradePrice ?? null;

  const midpoint = calculateMidpoint(bestBid, bestAsk);
  const hasFreshBook =
    isValidBinaryPrice(event.bestBid) && isValidBinaryPrice(event.bestAsk);
  const hasFreshLastTrade = isValidBinaryPrice(event.lastTradePrice);

  const rawMarkPrice =
    (hasFreshBook ? midpoint : null) ??
    (hasFreshLastTrade ? event.lastTradePrice : null) ??
    midpoint ??
    (isValidBinaryPrice(existingSnapshot?.markPrice ?? null)
      ? existingSnapshot?.markPrice ?? null
      : null);

  const markPrice =
    rawMarkPrice === null
      ? null
      : clampMarkPrice(rawMarkPrice, existingSnapshot?.markPrice ?? null);

  return {
    bestBid,
    bestAsk,
    midpoint,
    markPrice,
    lastTradePrice
  };
}
