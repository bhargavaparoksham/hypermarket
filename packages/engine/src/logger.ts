import { LogContext } from "./types.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export function createLogger(minLevel: LogLevel): Logger {
  const minPriority = LEVEL_PRIORITY[minLevel];

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= minPriority;
  }

  return {
    debug(message, context) {
      if (shouldLog("debug")) {
        write("debug", message, context);
      }
    },
    info(message, context) {
      if (shouldLog("info")) {
        write("info", message, context);
      }
    },
    warn(message, context) {
      if (shouldLog("warn")) {
        write("warn", message, context);
      }
    },
    error(message, context) {
      if (shouldLog("error")) {
        write("error", message, context);
      }
    }
  };
}
