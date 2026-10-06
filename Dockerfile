# Multi-stage build for the Keychain marketplace.
#
# Notes:
#  * Uses Next's `output: "standalone"` so the final image carries only the
#    traced server bundle, not the whole node_modules tree.
#  * Prisma 7 with a driver adapter (PrismaPg) runs on a JavaScript query
#    compiler, so no Rust query-engine binary needs copying into the runner.
#  * The final stage runs as a non-root user. A container process that does not
#    need root should never have it.

# ---------------------------------------------------------------------------
# 1. Dependencies
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

# Copy only the manifests first so this layer is cached until they change.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2. Build
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# The build imports lib/env.ts, which refuses to start on invalid config. These
# placeholders satisfy it; the build only constructs the Prisma client, it never
# queries. Real values are supplied at RUN time.
#
# Passed per-command rather than as ENV so they do not persist into any image
# layer or image metadata - these names would otherwise look like leaked
# secrets to a scanner, and a future real value would actually be one.
#
# VERCEL_ENV/APP_ENV are deliberately NOT "production" here, so the
# production-only guards (no MOCK payments, no LOCAL uploads, https URL) do not
# trip during an ordinary image build. See lib/env.ts.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    BETTER_AUTH_SECRET="build-time-placeholder-value-32-chars-min" \
    BETTER_AUTH_URL="http://localhost:3000" \
    npm run build

# ---------------------------------------------------------------------------
# 3. Runtime
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run unprivileged. node:alpine already ships a `node` user (uid 1000).
RUN mkdir -p /app/public/uploads && chown -R node:node /app

# `public` holds static assets; `.next/static` holds hashed build output. The
# standalone bundle expects both beside its server.js.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Migrations are copied so `npx prisma migrate deploy` can be run against this
# image, but they are NOT applied automatically: schema changes on container
# start would mean several replicas racing to migrate the same database.
COPY --from=builder --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 3000

# Hits a real route, so the check fails if the app is up but not serving.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
