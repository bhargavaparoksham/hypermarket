import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAssetMetadataIndex,
  createPolymarketPriceFeed,
  mergePriceSnapshot,
  parsePolymarketPriceEvents
} from "../dist/prices/polymarket-price-feed.js";
import { createRedisMarketPriceStore } from "../dist/prices/price-store.js";
import { createLogger } from "../dist/logger.js";

class FakeRedisPipeline {
  constructor(redis) {
    this.redis = redis;
    this.commands = [];
  }

  set(key, value) {
    this.commands.push(["set", key, value]);
    return this;
  }

  sadd(key, value) {
    this.commands.push(["sadd", key, value]);
    return this;
  }

  lpush(key, value) {
    this.commands.push(["lpush", key, value]);
    return this;
  }

  ltrim(key, start, stop) {
    this.commands.push(["ltrim", key, start, stop]);
    return this;
  }

  get(key) {
    this.commands.push(["get", key]);
    return this;
  }

  async exec() {
    const results = [];

    for (const command of this.commands) {
      const [name, ...args] = command;
      results.push([null, await this.redis[name](...args)]);
    }

    return results;
  }
}

class FakeRedis {
  constructor() {
    this.values = new Map();
    this.sets = new Map();
    this.lists = new Map();
  }

  multi() {
    return new FakeRedisPipeline(this);
  }

  async set(key, value) {
    this.values.set(key, value);
    return "OK";
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async sadd(key, value) {
    const set = this.sets.get(key) ?? new Set();
    set.add(value);
    this.sets.set(key, set);
    return set.size;
  }

  async smembers(key) {
    return [...(this.sets.get(key) ?? new Set())];
  }

  async lpush(key, value) {
    const list = this.lists.get(key) ?? [];
    list.unshift(value);
    this.lists.set(key, list);
    return list.length;
  }

  async ltrim(key, start, stop) {
    const list = this.lists.get(key) ?? [];
    this.lists.set(key, list.slice(start, stop + 1));
    return "OK";
  }
}

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.handlers = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  send(payload) {
    this.sent.push(payload);
  }

  emit(type, event = {}) {
    const handlers = this.handlers.get(type) ?? [];
    for (const handler of handlers) {
      handler(event);
    }
  }
}

test("buildAssetMetadataIndex maps outcome token ids to market metadata", () => {
  const index = buildAssetMetadataIndex([
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
      outcomes: [
        {
          id: "yes",
          name: "Yes",
          tokenId: "token-yes",
          price: null,
          winner: null
        },
        {
          id: "no",
          name: "No",
          tokenId: "token-no",
          price: null,
          winner: null
        }
      ]
    }
  ]);

  assert.deepEqual(index.get("token-yes"), {
    marketId: "market-1",
    outcome: "Yes"
  });
});

test("parsePolymarketPriceEvents handles best_bid_ask and price_change messages", () => {
  const events = parsePolymarketPriceEvents([
    {
      event_type: "best_bid_ask",
      asset_id: "token-yes",
      best_bid: "0.48",
      best_ask: "0.52",
      last_trade_price: "0.5"
    },
    {
      event_type: "price_change",
      asset_id: "token-no",
      price: "0.41"
    }
  ]);

  assert.deepEqual(events, [
    {
      assetId: "token-yes",
      bestBid: 0.48,
      bestAsk: 0.52,
      lastTradePrice: 0.5
    },
    {
      assetId: "token-no",
      bestBid: null,
      bestAsk: null,
      lastTradePrice: 0.41
    }
  ]);
});

test("mergePriceSnapshot prefers midpoint and falls back to last trade", () => {
  const midpointSnapshot = mergePriceSnapshot(null, {
    assetId: "token-yes",
    bestBid: 0.48,
    bestAsk: 0.52,
    lastTradePrice: 0.49
  });

  assert.equal(midpointSnapshot.midpoint, 0.5);
  assert.equal(midpointSnapshot.markPrice, 0.5);

  const lastTradeOnlySnapshot = mergePriceSnapshot(
    {
      bestBid: null,
      bestAsk: null,
      lastTradePrice: 0.49
    },
    {
      assetId: "token-yes",
      bestBid: null,
      bestAsk: null,
      lastTradePrice: 0.51
    }
  );

  assert.equal(lastTradeOnlySnapshot.midpoint, null);
  assert.equal(lastTradeOnlySnapshot.markPrice, 0.51);
});

test("parsePolymarketPriceEvents derives top of book from book events", () => {
  const events = parsePolymarketPriceEvents({
    event_type: "book",
    asset_id: "token-yes",
    bids: [{ price: "0.45" }],
    asks: [{ price: "0.55" }],
    last_trade_price: "0.5"
  });

  assert.deepEqual(events, [
    {
      assetId: "token-yes",
      bestBid: 0.45,
      bestAsk: 0.55,
      lastTradePrice: 0.5
    }
  ]);
});

test("redis market price store marks old snapshots as stale and lists market snapshots", async () => {
  const redis = new FakeRedis();
  const store = createRedisMarketPriceStore(redis);

  await store.setSnapshot({
    marketId: "market-1",
    outcomeTokenId: "token-yes",
    outcome: "Yes",
    bestBid: 0.45,
    bestAsk: 0.55,
    midpoint: 0.5,
    markPrice: 0.5,
    lastTradePrice: 0.49,
    updatedAt: "2026-01-01T00:00:00.000Z"
  });

  await store.setSnapshot({
    marketId: "market-1",
    outcomeTokenId: "token-no",
    outcome: "No",
    bestBid: 0.44,
    bestAsk: 0.56,
    midpoint: 0.5,
    markPrice: 0.5,
    lastTradePrice: 0.5
  });

  const staleSnapshot = await store.getSnapshot("token-yes");
  const marketSnapshots = await store.listSnapshots("market-1");

  assert.equal(staleSnapshot.stale, true);
  assert.equal(marketSnapshots.length, 2);
  assert.deepEqual(
    marketSnapshots.map((snapshot) => snapshot.outcomeTokenId),
    ["token-no", "token-yes"]
  );
});

test("price feed subscribes to token ids and writes merged snapshots", async () => {
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;

  const snapshots = [];
  const feed = createPolymarketPriceFeed({
    logger: createLogger("error"),
    wsUrl: "wss://example.test/ws",
    markets: [
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
        outcomes: [
          {
            id: "yes",
            name: "Yes",
            tokenId: "token-yes",
            price: null,
            winner: null
          }
        ]
      }
    ],
    marketPriceStore: {
      async setSnapshot(snapshot) {
        snapshots.push(snapshot);
      },
      async getSnapshot() {
        return null;
      },
      async listSnapshots() {
        return [];
      }
    }
  });

  try {
    feed.start();

    assert.equal(FakeWebSocket.instances.length, 1);
    const socket = FakeWebSocket.instances[0];
    socket.emit("open");

    assert.equal(socket.sent.length, 1);
    assert.deepEqual(JSON.parse(socket.sent[0]), {
      type: "market",
      assets_ids: ["token-yes"],
      custom_feature_enabled: true
    });

    socket.emit("message", {
      data: JSON.stringify({
        event_type: "best_bid_ask",
        asset_id: "token-yes",
        best_bid: "0.48",
        best_ask: "0.52",
        last_trade_price: "0.49"
      })
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(snapshots.length, 1);
    assert.deepEqual(snapshots[0], {
      marketId: "market-1",
      outcomeTokenId: "token-yes",
      outcome: "Yes",
      bestBid: 0.48,
      bestAsk: 0.52,
      midpoint: 0.5,
      markPrice: 0.5,
      lastTradePrice: 0.49
    });
  } finally {
    FakeWebSocket.instances = [];
    globalThis.WebSocket = originalWebSocket;
  }
});
