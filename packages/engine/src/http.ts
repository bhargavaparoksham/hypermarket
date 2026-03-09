import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { EngineConfig } from "./types.js";
import { Logger } from "./logger.js";
import { MarketDiscoveryService } from "./markets/market-service.js";
import { MarketPriceStore } from "./prices/price-store.js";

interface HttpServices {
  marketDiscoveryService: MarketDiscoveryService;
  marketPriceStore: MarketPriceStore;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.end(JSON.stringify(payload));
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: EngineConfig,
  logger: Logger,
  services: HttpServices
): Promise<void> {
  const requestUrl = new URL(request.url || "/", `http://${config.host}:${config.port}`);
  const pathname = requestUrl.pathname;

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/healthz") {
    writeJson(response, 200, {
      ok: true,
      mode: config.mode
    });
    return;
  }

  if (request.method === "GET" && pathname === "/readyz") {
    writeJson(response, 200, {
      ok: true,
      dependencies: {
        databaseConfigured: Boolean(config.databaseUrl),
        redisConfigured: Boolean(config.redisUrl),
        polymarketConfigured:
          Boolean(config.polymarketApiUrl) && Boolean(config.polymarketWsUrl),
        settlementConfigured:
          Boolean(config.polygonRpcUrl) &&
          Boolean(config.vaultManagerPrivateKey) &&
          Boolean(config.hyperVaultAddress)
      }
    });
    return;
  }

  if (request.method === "GET" && pathname === "/markets") {
    try {
      const markets = await services.marketDiscoveryService.listMarkets();
      writeJson(response, 200, {
        ok: true,
        markets
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown markets error";
      logger.error("Failed to load allowlisted markets", {
        error: message
      });
      writeJson(response, 502, {
        ok: false,
        error: "Unable to fetch allowlisted markets"
      });
    }
    return;
  }

  const marketPricesMatch = pathname.match(/^\/markets\/([^/]+)\/prices$/);
  if (request.method === "GET" && marketPricesMatch) {
    try {
      const marketId = decodeURIComponent(marketPricesMatch[1]);
      const prices = await services.marketPriceStore.listSnapshots(marketId);
      writeJson(response, 200, {
        ok: true,
        marketId,
        prices
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown price lookup error";
      logger.error("Failed to load market prices", {
        error: message
      });
      writeJson(response, 502, {
        ok: false,
        error: "Unable to fetch market prices"
      });
    }
    return;
  }

  writeJson(response, 404, {
    ok: false,
    error: "Not found"
  });
}

export function startHttpServer(
  config: EngineConfig,
  logger: Logger,
  services: HttpServices
) {
  const server = createServer((request, response) => {
    void handleRequest(request, response, config, logger, services).catch(
      (error) => {
        const message =
          error instanceof Error ? error.message : "Unknown request error";
        logger.error("Unhandled API request error", {
          error: message
        });

        if (!response.headersSent) {
          writeJson(response, 500, {
            ok: false,
            error: "Internal server error"
          });
        }
      }
    );
  });

  server.listen(config.port, config.host, () => {
    logger.info("API server listening", {
      host: config.host,
      port: config.port,
      mode: config.mode
    });
  });

  return server;
}
