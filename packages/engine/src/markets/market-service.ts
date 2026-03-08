import { Logger } from "../logger.js";
import { PolymarketClient } from "./polymarket-client.js";
import { SupportedMarket } from "@hypermarket/shared";

interface CreateMarketDiscoveryServiceOptions {
  allowlist: string[];
  cacheTtlMs: number;
  client: PolymarketClient;
  logger: Logger;
}

interface CachedMarkets {
  expiresAt: number;
  markets: SupportedMarket[];
}

export interface MarketDiscoveryService {
  listMarkets(): Promise<SupportedMarket[]>;
}

export function createMarketDiscoveryService(
  options: CreateMarketDiscoveryServiceOptions
): MarketDiscoveryService {
  let cache: CachedMarkets | null = null;

  return {
    async listMarkets() {
      if (options.allowlist.length === 0) {
        options.logger.warn("Market discovery requested with an empty allowlist");
        return [];
      }

      if (cache && cache.expiresAt > Date.now()) {
        return cache.markets;
      }

      const allowlistedMarkets = await options.client.getMarketsByAllowlist(
        options.allowlist
      );

      cache = {
        expiresAt: Date.now() + options.cacheTtlMs,
        markets: allowlistedMarkets
      };

      options.logger.info("Refreshed allowlisted markets", {
        allowlistedMarkets: allowlistedMarkets.length
      });

      return allowlistedMarkets;
    }
  };
}
