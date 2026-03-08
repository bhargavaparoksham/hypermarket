import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../dist/logger.js";
import { createMarketDiscoveryService } from "../dist/markets/market-service.js";
import {
  normalizePolymarketMarket,
  resolveAllowlistedMarket
} from "../dist/markets/polymarket-client.js";

test("normalizePolymarketMarket maps token-based outcomes", () => {
  const market = normalizePolymarketMarket({
    conditionId: "0xcondition",
    slug: "fed-cuts-rates",
    question: "Will the Fed cut rates this month?",
    description: "Binary macro market",
    active: true,
    closed: false,
    archived: false,
    endDate: "2026-03-31T00:00:00Z",
    tokens: [
      {
        token_id: "111",
        outcome: "Yes",
        price: "0.61",
        winner: false
      },
      {
        token_id: "222",
        outcome: "No",
        price: "0.39",
        winner: null
      }
    ]
  });

  assert.ok(market);
  assert.equal(market.id, "0xcondition");
  assert.equal(market.outcomes.length, 2);
  assert.deepEqual(market.outcomes[0], {
    id: "111",
    name: "Yes",
    tokenId: "111",
    price: 0.61,
    winner: false
  });
});

test("normalizePolymarketMarket falls back to array-like strings", () => {
  const market = normalizePolymarketMarket({
    id: 42,
    slug: "election-2028",
    question: "Will candidate X win?",
    outcomes: '["Yes","No"]',
    outcomePrices: "[0.52,0.48]",
    clobTokenIds: '["abc","def"]'
  });

  assert.ok(market);
  assert.equal(market.id, "42");
  assert.deepEqual(market.outcomes, [
    {
      id: "abc",
      name: "Yes",
      tokenId: "abc",
      price: 0.52,
      winner: null
    },
    {
      id: "def",
      name: "No",
      tokenId: "def",
      price: 0.48,
      winner: null
    }
  ]);
});

test("resolveAllowlistedMarket prefers slug lookup and returns exact match", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.match(url, /slug=fed-cuts-rates/);

    return new Response(
      JSON.stringify([
        {
          id: "market-1",
          slug: "fed-cuts-rates",
          question: "Question",
          outcomes: '["Yes","No"]',
          outcomePrices: "[0.55,0.45]"
        }
      ]),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  try {
    const market = await resolveAllowlistedMarket(
      "https://gamma-api.polymarket.com",
      "fed-cuts-rates"
    );

    assert.ok(market);
    assert.equal(market.slug, "fed-cuts-rates");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("market discovery service caches allowlisted responses", async () => {
  let calls = 0;

  const service = createMarketDiscoveryService({
    allowlist: ["fed-cuts-rates"],
    cacheTtlMs: 60_000,
    logger: createLogger("error"),
    client: {
      async getMarketsByAllowlist() {
        calls += 1;
        return [
          {
            id: "market-1",
            slug: "fed-cuts-rates",
            conditionId: "0xcondition",
            question: "Question",
            description: null,
            active: true,
            closed: false,
            archived: false,
            endDate: null,
            source: "polymarket",
            outcomes: []
          }
        ];
      }
    }
  });

  const first = await service.listMarkets();
  const second = await service.listMarkets();

  assert.equal(calls, 1);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
});

test("market discovery service preserves direct lookup order and dedupes ids", async () => {
  const service = createMarketDiscoveryService({
    allowlist: ["fed-cuts-rates", "0xcondition"],
    cacheTtlMs: 60_000,
    logger: createLogger("error"),
    client: {
      async getMarketsByAllowlist(allowlist) {
        assert.deepEqual(allowlist, ["fed-cuts-rates", "0xcondition"]);
        return [
          {
            id: "market-1",
            slug: "fed-cuts-rates",
            conditionId: "0xcondition",
            question: "Question",
            description: null,
            active: true,
            closed: false,
            archived: false,
            endDate: null,
            source: "polymarket",
            outcomes: []
          }
        ];
      }
    }
  });

  const markets = await service.listMarkets();

  assert.equal(markets.length, 1);
  assert.equal(markets[0].id, "market-1");
});
