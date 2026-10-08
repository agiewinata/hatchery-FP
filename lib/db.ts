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
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,

    // Neon lives in ap-southeast-1 and the path to it drops packets often
    // enough to matter: an identical connect can succeed in 1s or die at 21s.
    // pg's defaults make that as painful as possible, so all three are set
    // explicitly rather than inherited.

    // Default is NO timeout, so a stalled handshake hangs the request until the
    // OS gives up (~21s on Windows) and surfaces as a bare ETIMEDOUT. Failing
    // at 10s with pg's own message is both faster and far more legible.
    connectionTimeoutMillis: 10_000,

    // Default is 10s, which in a quiet dev session means almost every request
    // opens a brand new connection and rolls the dice on the handshake again.
    // Holding them a minute turns most page loads into zero new connections.
    idleTimeoutMillis: 60_000,

    // Stops a NAT or firewall silently discarding an idle connection and
    // leaving the pool handing out sockets that are already dead.
    keepAlive: true,
  });

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
