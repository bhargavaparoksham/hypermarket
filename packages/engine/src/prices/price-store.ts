import {
  MARKET_PRICE_DEFAULTS,
  MarketPriceSnapshot,
  RISK_PARAMETERS
} from "@hypermarket/shared";
import { Redis } from "ioredis";

interface StoredMarketPriceSnapshot {
  marketId: string;
  outcomeTokenId: string;
  outcome: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  markPrice: number | null;
  lastTradePrice: number | null;
  updatedAt: string;
}

export interface WriteMarketPriceSnapshot
  extends Omit<StoredMarketPriceSnapshot, "updatedAt"> {
  updatedAt?: string;
}

export interface MarketPriceStore {
  setSnapshot(snapshot: WriteMarketPriceSnapshot): Promise<void>;
  getSnapshot(outcomeTokenId: string): Promise<MarketPriceSnapshot | null>;
  listSnapshots(marketId?: string): Promise<MarketPriceSnapshot[]>;
}

function currentKey(outcomeTokenId: string): string {
  return `${MARKET_PRICE_DEFAULTS.redisKeyPrefix}:current:${outcomeTokenId}`;
}

function historyKey(outcomeTokenId: string): string {
  return `${MARKET_PRICE_DEFAULTS.redisKeyPrefix}:history:${outcomeTokenId}`;
}

function marketSetKey(marketId: string): string {
  return `${MARKET_PRICE_DEFAULTS.redisKeyPrefix}:market:${marketId}`;
}

function toSnapshot(
  storedSnapshot: StoredMarketPriceSnapshot
): MarketPriceSnapshot {
  return {
    ...storedSnapshot,
    stale:
      Date.now() - new Date(storedSnapshot.updatedAt).getTime() >
      RISK_PARAMETERS.stalePriceThresholdMs
  };
}

export function createRedisMarketPriceStore(
  redis: Redis
): MarketPriceStore {
  return {
    async setSnapshot(snapshot) {
      const storedSnapshot: StoredMarketPriceSnapshot = {
        ...snapshot,
        updatedAt: snapshot.updatedAt || new Date().toISOString()
      };

      const pipeline = redis.multi();
      pipeline.set(
        currentKey(snapshot.outcomeTokenId),
        JSON.stringify(storedSnapshot)
      );
      pipeline.sadd(marketSetKey(snapshot.marketId), snapshot.outcomeTokenId);
      pipeline.lpush(
        historyKey(snapshot.outcomeTokenId),
        JSON.stringify(storedSnapshot)
      );
      pipeline.ltrim(
        historyKey(snapshot.outcomeTokenId),
        0,
        MARKET_PRICE_DEFAULTS.historyLimit - 1
      );
      await pipeline.exec();
    },

    async getSnapshot(outcomeTokenId) {
      const payload = await redis.get(currentKey(outcomeTokenId));
      if (!payload) {
        return null;
      }

      return toSnapshot(JSON.parse(payload) as StoredMarketPriceSnapshot);
    },

    async listSnapshots(marketId) {
      if (!marketId) {
        return [];
      }

      const outcomeTokenIds = await redis.smembers(marketSetKey(marketId));
      if (outcomeTokenIds.length === 0) {
        return [];
      }

      const pipeline = redis.multi();
      for (const outcomeTokenId of outcomeTokenIds) {
        pipeline.get(currentKey(outcomeTokenId));
      }

      const results = await pipeline.exec();
      if (!results) {
        return [];
      }

      return results
        .map((entry) => entry[1])
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => toSnapshot(JSON.parse(entry) as StoredMarketPriceSnapshot))
        .sort((left, right) => left.outcomeTokenId.localeCompare(right.outcomeTokenId));
    }
  };
}
