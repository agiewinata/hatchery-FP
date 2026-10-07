import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (migrations, studio, db push).
 *
 * IMPORTANT: this is NOT the connection the application uses at runtime. The
 * app connects through lib/db.ts with the `pg` driver adapter and the POOLED
 * url, which is what a serverless deployment needs.
 *
 * Migrations, however, must use the DIRECT (unpooled) endpoint. Neon's pooled
 * endpoint runs PgBouncer in transaction mode, which does not keep session
 * state - and Prisma's migration engine relies on session-level advisory locks
 * to stop two migrations running at once. Pointed at the pooler, migrations
 * hang or fail with confusing errors.
 *
 * For Neon the direct host is simply the pooled host without `-pooler`, so it
 * is derived automatically rather than making you fetch a second string. Set
 * DIRECT_URL explicitly to override (e.g. on a non-Neon host).
 */
function migrationUrl(): string | undefined {
  const explicit = process.env["DIRECT_URL"];
  if (explicit) return explicit;

  const pooled = process.env["DATABASE_URL"];
  if (!pooled) return undefined;

  // Neon: ep-name-123-pooler.region.aws.neon.tech -> ep-name-123.region.aws.neon.tech
  // A no-op for any host that does not contain "-pooler".
  return pooled.replace("-pooler.", ".");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl(),
  },
});
