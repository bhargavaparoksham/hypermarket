import { SupportedMarket, SupportedMarketOutcome } from "@hypermarket/shared";
import { Logger } from "../logger.js";

interface CreatePolymarketClientOptions {
  apiUrl: string;
  logger: Logger;
}

export interface PolymarketClient {
  getMarketsByAllowlist(allowlist: string[]): Promise<SupportedMarket[]>;
}

interface RawPolymarketToken {
  token_id?: unknown;
  outcome?: unknown;
  price?: unknown;
  winner?: unknown;
}

interface RawPolymarketMarket {
  id?: unknown;
  slug?: unknown;
  marketSlug?: unknown;
  conditionId?: unknown;
  question?: unknown;
  description?: unknown;
  active?: unknown;
  closed?: unknown;
  archived?: unknown;
  endDate?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  clobTokenIds?: unknown;
  tokens?: unknown;
}

type MarketLookupKey = "slug" | "conditionId" | "id";

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
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

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toStringOrNull(item))
      .filter((item): item is string => item !== null);
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => toStringOrNull(item))
        .filter((item): item is string => item !== null);
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseNumberArray(value: unknown): Array<number | null> {
  if (Array.isArray(value)) {
    return value.map((item) => toNumberOrNull(item));
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => toNumberOrNull(item));
    }
  } catch {
    return value.split(",").map((item) => toNumberOrNull(item.trim()));
  }

  return [];
}

function normalizeOutcomeFromToken(token: RawPolymarketToken): SupportedMarketOutcome | null {
  const name = toStringOrNull(token.outcome);
  if (!name) {
    return null;
  }

  const tokenId = toStringOrNull(token.token_id);

  return {
    id: tokenId || name.toLowerCase().replace(/\s+/g, "-"),
    name,
    tokenId,
    price: toNumberOrNull(token.price),
    winner: typeof token.winner === "boolean" ? token.winner : null
  };
}

function normalizeOutcomes(market: RawPolymarketMarket): SupportedMarketOutcome[] {
  if (Array.isArray(market.tokens)) {
    const tokenOutcomes = market.tokens
      .map((token) =>
        token && typeof token === "object"
          ? normalizeOutcomeFromToken(token as RawPolymarketToken)
          : null
      )
      .filter((outcome): outcome is SupportedMarketOutcome => outcome !== null);

    if (tokenOutcomes.length > 0) {
      return tokenOutcomes;
    }
  }

  const names = parseStringArray(market.outcomes);
  const prices = parseNumberArray(market.outcomePrices);
  const tokenIds = parseStringArray(market.clobTokenIds);

  return names.map((name, index) => ({
    id: tokenIds[index] || name.toLowerCase().replace(/\s+/g, "-"),
    name,
    tokenId: tokenIds[index] || null,
    price: prices[index] ?? null,
    winner: null
  }));
}

export function normalizePolymarketMarket(
  rawMarket: RawPolymarketMarket
): SupportedMarket | null {
  const id = toStringOrNull(rawMarket.conditionId) || toStringOrNull(rawMarket.id);
  const slug = toStringOrNull(rawMarket.slug) || toStringOrNull(rawMarket.marketSlug);
  const question = toStringOrNull(rawMarket.question);

  if (!id || !slug || !question) {
    return null;
  }

  return {
    id,
    slug,
    conditionId: toStringOrNull(rawMarket.conditionId),
    question,
    description: toStringOrNull(rawMarket.description),
    active: toBoolean(rawMarket.active),
    closed: toBoolean(rawMarket.closed),
    archived: toBoolean(rawMarket.archived),
    endDate: toStringOrNull(rawMarket.endDate),
    source: "polymarket",
    outcomes: normalizeOutcomes(rawMarket)
  };
}

function buildLookupOrder(identifier: string): MarketLookupKey[] {
  if (/^0x[a-fA-F0-9]+$/.test(identifier)) {
    return ["conditionId", "id", "slug"];
  }

  if (/^\d+$/.test(identifier)) {
    return ["id", "slug", "conditionId"];
  }

  return ["slug", "conditionId", "id"];
}

function matchesIdentifier(
  market: SupportedMarket,
  identifier: string,
  key: MarketLookupKey
): boolean {
  const normalizedIdentifier = identifier.toLowerCase();

  if (key === "slug") {
    return market.slug.toLowerCase() === normalizedIdentifier;
  }

  if (key === "conditionId") {
    return market.conditionId?.toLowerCase() === normalizedIdentifier;
  }

  return market.id.toLowerCase() === normalizedIdentifier;
}

async function fetchMarketsByKey(
  apiUrl: string,
  key: MarketLookupKey,
  identifier: string
): Promise<SupportedMarket[]> {
  const requestUrl = new URL("/markets", apiUrl);
  requestUrl.searchParams.set(key, identifier);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(requestUrl, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `Polymarket market discovery failed with status ${response.status}`
      );
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error("Polymarket market discovery returned a non-array payload");
    }

    return payload
      .map((item) =>
        item && typeof item === "object"
          ? normalizePolymarketMarket(item as RawPolymarketMarket)
          : null
      )
      .filter((item): item is SupportedMarket => item !== null);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveAllowlistedMarket(
  apiUrl: string,
  identifier: string
): Promise<SupportedMarket | null> {
  for (const key of buildLookupOrder(identifier)) {
    const markets = await fetchMarketsByKey(apiUrl, key, identifier);
    const exactMatch = markets.find((market) =>
      matchesIdentifier(market, identifier, key)
    );

    if (exactMatch) {
      return exactMatch;
    }
  }

  return null;
}

export function createPolymarketClient(
  options: CreatePolymarketClientOptions
): PolymarketClient {
  return {
    async getMarketsByAllowlist(allowlist) {
      const seen = new Set<string>();
      const resolvedMarkets: SupportedMarket[] = [];

      for (const identifier of allowlist) {
        const trimmedIdentifier = identifier.trim();
        if (!trimmedIdentifier) {
          continue;
        }

        const market = await resolveAllowlistedMarket(
          options.apiUrl,
          trimmedIdentifier
        );

        if (!market) {
          options.logger.warn("Allowlisted market was not found in Polymarket", {
            identifier: trimmedIdentifier
          });
          continue;
        }

        if (seen.has(market.id)) {
          continue;
        }

        seen.add(market.id);
        resolvedMarkets.push(market);
      }

      options.logger.debug("Resolved allowlisted Polymarket markets", {
        allowlistedMarkets: resolvedMarkets.length
      });

      return resolvedMarkets;
    }
  };
}
