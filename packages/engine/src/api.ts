import { startHttpServer } from "./http.js";
import { createRuntime } from "./runtime.js";

const { config, logger } = createRuntime();

logger.info("Booting engine API", {
  port: config.port,
  host: config.host
});

startHttpServer({ ...config, mode: "api" }, logger);
