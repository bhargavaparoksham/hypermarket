import type { MarketPriceSnapshot, SupportedMarket } from "@hypermarket/shared";

export const orderSides = ["Long", "Short"] as const;
export const leverageMarks = [1, 2, 3, 5, 10] as const;

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return "No end date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatSnapshotTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function compactIdentifier(value: string, start = 8, end = 6): string {
  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function outcomeLabel(price: MarketPriceSnapshot): string {
  return price.outcome ?? "Outcome";
}

export function marketStatusLabel(market: SupportedMarket): string {
  if (market.closed) {
    return "Closed";
  }

  if (!market.active) {
    return "Paused";
  }

  return "Live";
}

export function getHeadlinePrice(
  market: SupportedMarket,
  prices: MarketPriceSnapshot[]
): MarketPriceSnapshot | null {
  if (prices.length > 0) {
    const pricedOutcomes = [...prices].sort((left, right) => {
      return (
        (right.markPrice ?? right.midpoint ?? -1) -
        (left.markPrice ?? left.midpoint ?? -1)
      );
    });

    return pricedOutcomes[0] ?? null;
  }

  const outcome =
    market.outcomes.find((item) => item.price !== null) ?? market.outcomes[0];
  if (!outcome) {
    return null;
  }

  return {
    marketId: market.id,
    outcomeTokenId: outcome.tokenId ?? outcome.id,
    outcome: outcome.name,
    bestBid: null,
    bestAsk: null,
    midpoint: outcome.price,
    markPrice: outcome.price,
    lastTradePrice: outcome.price,
    updatedAt: new Date(0).toISOString(),
    stale: true
  };
}
