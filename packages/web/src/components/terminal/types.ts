import type { MarketPriceSnapshot, SupportedMarket } from "@hypermarket/shared";

export interface MarketsResponse {
  ok: boolean;
  markets: SupportedMarket[];
}

export interface MarketPricesResponse {
  ok: boolean;
  marketId: string;
  prices: MarketPriceSnapshot[];
}

export interface TerminalMarket extends SupportedMarket {
  prices: MarketPriceSnapshot[];
  bestOutcome: MarketPriceSnapshot | null;
}
