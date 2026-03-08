import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

export function createRuntime() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  return {
    config,
    logger
  };
}
