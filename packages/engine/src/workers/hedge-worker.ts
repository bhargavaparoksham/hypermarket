import { Logger } from "../logger.js";
import { ExposureService } from "../services/exposure-service.js";
import { HedgeExecutionService } from "../services/hedge-execution-service.js";

export function startHedgeExecutionLoop(options: {
  exposureService: ExposureService;
  hedgeExecutionService: HedgeExecutionService;
  intervalMs: number;
  logger: Logger;
}): NodeJS.Timeout {
  return setInterval(() => {
    void options.exposureService
      .getExposureSnapshot()
      .then((snapshot) => options.hedgeExecutionService.execute(snapshot))
      .then((result) => {
        if (result.created > 0 || result.failed > 0) {
          options.logger.info("Hedge execution cycle completed", {
            ...result
          });
          return;
        }

        options.logger.debug("Hedge execution cycle completed", {
          ...result
        });
      })
      .catch((error: unknown) => {
        options.logger.error("Hedge execution cycle failed", {
          error: error instanceof Error ? error.message : "Unknown hedge execution error"
        });
      });
  }, options.intervalMs);
}
