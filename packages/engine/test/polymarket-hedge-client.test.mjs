import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";
import { createPolymarketHedgeClient } from "../dist/services/polymarket-hedge-client.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}

test("returns a submitted dry-run hedge result without network calls", async () => {
  const client = createPolymarketHedgeClient({
    executionUrl: null,
    dryRun: true,
    logger: createLogger(),
    fetchImpl: async () => {
      throw new Error("should not fetch in dry-run");
    }
  });

  const result = await client.executeHedge({
    marketId: "market-a",
    outcomeTokenId: "yes-token",
    side: "SHORT",
    targetNotional: new Decimal("5")
  });

  assert.equal(result.status, "SUBMITTED");
  assert.equal(result.filledNotional.toString(), "0");
  assert.match(result.externalOrderId, /^dry-run:/);
});

test("posts hedge intents to the configured proxy and normalizes the response", async () => {
  const requests = [];
  const client = createPolymarketHedgeClient({
    executionUrl: "https://hedge-proxy.example",
    dryRun: false,
    apiKey: "secret-key",
    logger: createLogger(),
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        init
      });

      return {
        ok: true,
        async json() {
          return {
            status: "FILLED",
            orderId: "pm-order-1",
            filledNotional: "5",
            averageFillPrice: "0.49"
          };
        }
      };
    }
  });

  const result = await client.executeHedge({
    marketId: "market-a",
    outcomeTokenId: "yes-token",
    side: "SHORT",
    targetNotional: new Decimal("5")
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://hedge-proxy.example/hedge");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.authorization, "Bearer secret-key");
  assert.equal(result.status, "FILLED");
  assert.equal(result.externalOrderId, "pm-order-1");
  assert.equal(result.filledNotional, "5");
  assert.equal(result.averageFillPrice, "0.49");
});
