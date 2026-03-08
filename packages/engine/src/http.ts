import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { EngineConfig } from "./types.js";
import { Logger } from "./logger.js";

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: EngineConfig
): void {
  const url = request.url || "/";

  if (request.method === "GET" && url === "/healthz") {
    writeJson(response, 200, {
      ok: true,
      mode: config.mode
    });
    return;
  }

  if (request.method === "GET" && url === "/readyz") {
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

  writeJson(response, 404, {
    ok: false,
    error: "Not found"
  });
}

export function startHttpServer(config: EngineConfig, logger: Logger) {
  const server = createServer((request, response) => {
    handleRequest(request, response, config);
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
