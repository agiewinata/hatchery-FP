/**
 * Prisma client singleton.
 *
 * Each PrismaClient opens its own connection pool. Next.js hot-reloads modules
 * in development, so without caching on `globalThis` we would leak a new pool
 * on every edit and exhaust Neon's connection limit within minutes.
 *
 * SECURITY: `server-only` keeps the database client (and the connection string
 * it carries) out of any client bundle.
 */
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "./env";
import { PrismaClient } from "./generated/prisma/client";

const createPrismaClient = () => {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    // Surface slow/failing queries in development; stay quiet in production so
    // query text (which can contain personal data) never reaches the logs.
    log:
      env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
