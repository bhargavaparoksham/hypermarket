import { SupportedMarket } from "@hypermarket/shared";
import { Logger } from "../logger.js";
import {
  MarketPriceStore,
  WriteMarketPriceSnapshot
} from "./price-store.js";

interface CreatePolymarketPriceFeedOptions {
  logger: Logger;
  marketPriceStore: MarketPriceStore;
  markets: SupportedMarket[];
  wsUrl: string;
}

interface SubscriptionMessage {
  type: "market";
  assets_ids: string[];
  custom_feature_enabled: boolean;
}

interface ParsedPolymarketPriceEvent {
  assetId: string;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
}

interface AssetMetadata {
  marketId: string;
  outcome: string | null;
}

export interface PolymarketPriceFeed {
  start(): void;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeMessageShape(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object"
    );
  }

  if (payload && typeof payload === "object") {
    return [payload as Record<string, unknown>];
  }

  return [];
}

export function buildAssetMetadataIndex(
  markets: SupportedMarket[]
): Map<string, AssetMetadata> {
  const index = new Map<string, AssetMetadata>();

  for (const market of markets) {
    for (const outcome of market.outcomes) {
      if (!outcome.tokenId) {
        continue;
      }

      index.set(outcome.tokenId, {
        marketId: market.id,
        outcome: outcome.name
      });
    }
  }

  return index;
}

export function parsePolymarketPriceEvents(
  payload: unknown
): ParsedPolymarketPriceEvent[] {
  const messages = normalizeMessageShape(payload);
  const events: ParsedPolymarketPriceEvent[] = [];

  for (const message of messages) {
    const eventType = typeof message.event_type === "string"
      ? message.event_type
      : typeof message.type === "string"
        ? message.type
        : null;

    if (eventType === "best_bid_ask") {
      const assetId =
        typeof message.asset_id === "string"
          ? message.asset_id
          : typeof message.assetId === "string"
            ? message.assetId
            : null;

      if (!assetId) {
        continue;
      }

      events.push({
        assetId,
        bestBid: toNumberOrNull(message.best_bid),
        bestAsk: toNumberOrNull(message.best_ask),
        lastTradePrice: toNumberOrNull(message.last_trade_price)
      });
      continue;
    }

    if (eventType === "price_change" || eventType === "last_trade_price") {
      const assetId =
        typeof message.asset_id === "string"
          ? message.asset_id
          : typeof message.assetId === "string"
            ? message.assetId
            : null;

      if (!assetId) {
        continue;
      }

      events.push({
        assetId,
        bestBid: null,
        bestAsk: null,
        lastTradePrice:
          toNumberOrNull(message.price) ??
          toNumberOrNull(message.last_trade_price)
      });
      continue;
    }

    if (eventType === "book") {
      const assetId =
        typeof message.asset_id === "string"
          ? message.asset_id
          : typeof message.assetId === "string"
            ? message.assetId
            : null;

      if (!assetId) {
        continue;
      }

      const bids = Array.isArray(message.bids) ? message.bids : [];
      const asks = Array.isArray(message.asks) ? message.asks : [];
      const bestBid = bids.length > 0 && typeof bids[0] === "object"
        ? toNumberOrNull((bids[0] as Record<string, unknown>).price)
        : null;
      const bestAsk = asks.length > 0 && typeof asks[0] === "object"
        ? toNumberOrNull((asks[0] as Record<string, unknown>).price)
        : null;

      events.push({
        assetId,
        bestBid,
        bestAsk,
        lastTradePrice: toNumberOrNull(message.last_trade_price)
      });
    }
  }

  return events;
}

export function mergePriceSnapshot(
  existingSnapshot: {
    bestBid: number | null;
    bestAsk: number | null;
    lastTradePrice: number | null;
  } | null,
  event: ParsedPolymarketPriceEvent
): Pick<
  WriteMarketPriceSnapshot,
  "bestBid" | "bestAsk" | "midpoint" | "markPrice" | "lastTradePrice"
> {
  const bestBid = event.bestBid ?? existingSnapshot?.bestBid ?? null;
  const bestAsk = event.bestAsk ?? existingSnapshot?.bestAsk ?? null;
  const lastTradePrice =
    event.lastTradePrice ?? existingSnapshot?.lastTradePrice ?? null;
  const midpoint =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const markPrice = midpoint ?? lastTradePrice;

  return {
    bestBid,
    bestAsk,
    midpoint,
    markPrice,
    lastTradePrice
  };
}

function createSubscriptionMessage(assetIds: string[]): string {
  const payload: SubscriptionMessage = {
    type: "market",
    assets_ids: assetIds,
    custom_feature_enabled: true
  };

  return JSON.stringify(payload);
}

export function createPolymarketPriceFeed(
  options: CreatePolymarketPriceFeedOptions
): PolymarketPriceFeed {
  const assetMetadata = buildAssetMetadataIndex(options.markets);
  const latestByAsset = new Map<
    string,
    {
      bestBid: number | null;
      bestAsk: number | null;
      lastTradePrice: number | null;
    }
  >();
  let reconnectTimer: NodeJS.Timeout | null = null;

  function scheduleReconnect(): void {
    if (reconnectTimer || assetMetadata.size === 0) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3_000);
  }

  function connect(): void {
    if (assetMetadata.size === 0) {
      options.logger.warn("Skipping price feed startup because no token ids were resolved");
      return;
    }

    const socket = new WebSocket(options.wsUrl);

    socket.addEventListener("open", () => {
      socket.send(createSubscriptionMessage([...assetMetadata.keys()]));
      options.logger.info("Connected to Polymarket price feed", {
        subscribedAssets: assetMetadata.size
      });
    });

    socket.addEventListener("message", async (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as unknown;
        const priceEvents = parsePolymarketPriceEvents(payload);

        for (const priceEvent of priceEvents) {
          const metadata = assetMetadata.get(priceEvent.assetId);
          if (!metadata) {
            continue;
          }

          const mergedSnapshot = mergePriceSnapshot(
            latestByAsset.get(priceEvent.assetId) ?? null,
            priceEvent
          );

          latestByAsset.set(priceEvent.assetId, {
            bestBid: mergedSnapshot.bestBid,
            bestAsk: mergedSnapshot.bestAsk,
            lastTradePrice: mergedSnapshot.lastTradePrice
          });

          await options.marketPriceStore.setSnapshot({
            marketId: metadata.marketId,
            outcomeTokenId: priceEvent.assetId,
            outcome: metadata.outcome,
            ...mergedSnapshot
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown websocket error";
        options.logger.error("Failed to process price feed message", {
          error: message
        });
      }
    });

    socket.addEventListener("error", (event) => {
      options.logger.error("Polymarket price feed socket error", {
        error: String(event.type)
      });
    });

    socket.addEventListener("close", () => {
      options.logger.warn("Polymarket price feed socket closed");
      scheduleReconnect();
    });
  }

  return {
    start() {
      connect();
    }
  };
}
