import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let prismaSingleton: unknown;

export function createPrismaClient(): any {
  if (!prismaSingleton) {
    const { PrismaClient } = require("@prisma/client") as {
      PrismaClient: new () => unknown;
    };
    prismaSingleton = new PrismaClient();
  }

  return prismaSingleton;
}
