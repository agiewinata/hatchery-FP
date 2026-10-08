@AGENTS.md

# Keychain marketplace — project context

A two-sided marketplace for custom keychains, acrylic charms, enamel pins and
memorabilia. University course project, graded partly on **security**, so
security controls are treated as deliverables with their own tests rather than
as an afterthought. See `README.md` for the full feature list and the numbered
security-control table.

**Hybrid fulfilment** is the defining constraint: a product is either
`PRINT_ON_DEMAND` (artist uploads artwork, *the platform* prints and ships, the
artist takes a royalty) or `SELLER_STOCKED` (the seller holds stock and ships it
themselves). Both are rows in **one `Product` table** with a `fulfilmentType`
discriminator — one catalog, one cart, one checkout, and the paths diverge only
*after* payment succeeds. Resist any change that forks this into two systems.

---

## The three rules

Everything in this codebase follows from these. Breaking one is a security bug,
not a style issue.

**1. `proxy.ts` does not authorize.** It issues the CSP nonce and redirects
signed-out visitors so they see a login page instead of an error. That is all.
Real authorization lives in `lib/data/*` (the Data Access Layer) and in route
layouts. Next middleware has historically been bypassable (CVE-2025-29927 class)
and cannot see Server Action invocations at all.

**2. Every mutation does its own guard, then a Zod parse.** A page-level check
does *not* protect a Server Action — an action is its own POST endpoint,
reachable without the page ever rendering.

**3. Money is never read from the client.** Prices, totals and the gateway
amount are computed server-side from the database inside the checkout
transaction. The checkout form submits an address and nothing else.

---

## Layout

```
app/
  (shop)/          storefront, account, seller, admin  — has header/footer
    seller/
      start/                    NOT gated (see gotcha below)
      (dashboard)/              gate layout lives here
    studio/                   3D studio — PRIVATE (see gotcha below)
    designs/[slug]/           shared design — PUBLIC, deliberately NOT under /studio
  (auth)/          login, register, password reset      — no shop chrome
  dev/pay/         simulated payment page (MOCK provider only)
  api/             better-auth handler, payment webhook, upload endpoint
lib/
  data/            DATA ACCESS LAYER — server-only, authorization lives here
  actions/         "use server" — guard, parse, delegate to data/
  payments/        gateway interface + Xendit and Mock implementations
  orders/          pure fulfilment state machine
  money.ts         pure pricing arithmetic
  errors.ts        typed errors, MUST import nothing (see gotcha)
  route-access.ts  pure path matching for proxy.ts
  slug.ts          shared slugify — used by BOTH products and studio designs
  studio/          pure 2D→3D geometry, MUST NOT import Three.js (see gotcha)
  env.ts           the ONLY reader of process.env
```

---

## Hard-won gotchas

Each of these cost real debugging time. Read before touching the related area.

### Next.js 16 specifics

- **`middleware.ts` is `proxy.ts`** and exports `proxy`, not `middleware`.
- **`next lint` and the `eslint` key in `next.config.ts` are gone.** Lint runs
  via `npm run lint` (bare `eslint`) and in CI.
- **Route types are generated.** `LayoutProps`/`PageProps` come from
  `.next/types`, so run `npx next typegen` after adding or moving a route or
  `tsc` will fail on a missing global type.
- **`LayoutRoutes` strips route groups.** A layout inside `(dashboard)` is still
  typed `LayoutProps<"/seller">`.
- **Read `node_modules/next/dist/docs/` before writing code** — see `AGENTS.md`.
  That is where the proxy, data-security and instrumentation answers came from.

### A gate layout must not wrap the page it redirects to

The seller gate originally sat at `app/(shop)/seller/layout.tsx`, so it wrapped
`/seller/start` too. Since the gate redirects a user with no shop *to*
`/seller/start`, that page redirected to itself forever. It presented as a
browser hang with a plain `200` in the log, not an error.

Fixed by moving the gate into a `(dashboard)` route group. **Any future gate
needs the same shape**: the escape-hatch page lives outside the group.

### Path prefixes must respect segment boundaries

`proxy.ts` used `pathname.startsWith("/seller")`, which also matches
`/sellers/...` — so every **public** artist portfolio redirected to login. One
of the required features, broken in the direction hardest to notice, because a
login page looks like it is working.

All matching now goes through `lib/route-access.ts`, which requires a `/`
boundary, and has 28 regression tests asserting both directions. Add to those
tests rather than hand-rolling a prefix check.

### `lib/errors.ts` must import nothing

The error classes are needed on both sides of the server/client boundary.
When they lived in `lib/data/*`, importing them pulled `lib/db.ts` and the
**Postgres driver into the browser bundle** (client components import
`idleState` from `lib/actions/result.ts`, which imports the error classes).
The build caught it. Keep that module dependency-free.

### `server-only` breaks plain Node scripts

`lib/auth.ts` and `lib/db.ts` import `server-only`, which throws outside Next's
bundler. Scripts that import them need the package's own export condition:

```
tsx --conditions=react-server prisma/seed.ts     # this is what db:seed does
```

Vitest handles it by aliasing `server-only` to `test/stubs/server-only.ts`.

### `instrumentation.ts` is compiled for the Edge runtime too

A `process.exit` *reference* fails the Edge compile even when guarded at
runtime, because the check is static. It throws instead. Do not add Node-only
API references to that file.

Its purpose: `lib/env.ts` throws on bad config, but Next lazily loads route
modules, so in a standalone build nothing imported it until the first request —
the container started, reported itself up, then failed per-request.
`register()` runs before the server accepts traffic, which makes "refuses to
start" actually true.

### Neon needs two different endpoints

| Use | Endpoint |
|---|---|
| App runtime (`DATABASE_URL`) | **pooled** — host contains `-pooler` |
| Prisma migrations | **direct** — pooled host minus `-pooler` |

The pooled endpoint runs PgBouncer in transaction mode and keeps no session
state, but Prisma's migration engine needs session-level advisory locks.
`prisma7.config.ts` derives the direct URL automatically; `DIRECT_URL`
overrides.

### Production guards key on `VERCEL_ENV`, not `NODE_ENV`

`next build` always sets `NODE_ENV=production`, so gating the production-only
checks (no MOCK payments, no LOCAL uploads, https URL) on it would block
ordinary local and Docker builds while adding no safety. `lib/env.ts` uses
`VERCEL_ENV`/`APP_ENV` instead.

### The lockfile must be generated on Linux

`package-lock.json` generated on Windows omits Linux-only optional dependencies
of `sharp`, so `npm ci` fails on **both** the Docker build and CI. Regenerate
with:

```bash
docker run --rm -v "C:/Keychain making:/app" -w /app node:24-alpine \
  npm install --package-lock-only
```

### Better Auth details that are easy to get wrong

- `role` and `banned` are declared **`input: false`**. Without it, any signed-in
  user could POST `{"role":"ADMIN"}` to the update-user endpoint. Load-bearing.
- The client method is **`requestPasswordReset`** and the route is
  `/request-password-reset` — not `forgetPassword`. A rate-limit rule keyed to a
  non-existent path silently never applies.
- `rateLimit.storage: "database"` requires the `RateLimit` model, whose
  `lastRequest` must be **`BigInt`** (`Date.now()` overflows Int32).
- Session **cookie caching is deliberately off** so a ban or role change takes
  effect on the next request.
- Scripted calls to `/api/auth/*` need an **`Origin` header** or they get
  `403 MISSING_OR_NULL_ORIGIN` from the CSRF check.

### The studio (2D image → 3D printable model)

A standalone tool at `/studio`. It sells nothing and shares no code with the
fulfilment model — `Product`, `OrderItem` and `fulfilmentType` are untouched.
Design doc: `docs/superpowers/specs/2026-10-07-studio-2d-to-3d-design.md`.

- **The CSP forbids WebAssembly.** `script-src` carries no `wasm-unsafe-eval`,
  so every WASM mesh library (`manifold-3d` and friends) is unusable. This is
  why the keyring hole is punched as an extra **polygon hole before
  triangulation** rather than as a boolean subtract: it removes any need for a
  CSG library, and therefore any need to weaken the CSP. Do not "simplify" this
  into a boolean op.

- **`lib/studio/*` must not import Three.js.** Same discipline as
  `lib/errors.ts` importing nothing: the maths returns plain typed arrays and
  only `components/studio/model-viewer.tsx` converts them to a
  `BufferGeometry`. This is what keeps the geometry unit-testable in plain node
  with no DOM and no WebGL.

- **`next/dynamic` with `ssr: false` only works inside a Client Component.**
  Three.js cannot server-render and is ~600KB, so the viewer is dynamically
  imported from `studio-editor.tsx` (a Client Component), never from a page.
  Verified: the Three chunk is absent from `rootMainFiles`, so storefront pages
  do not pay for it.

- **A hole that will not fit is DROPPED, not thrown.** On a concave outline a
  corner-positioned hole can land outside the material; handing earcut an
  uncontained ring yields a silently non-manifold mesh. `buildGeometry` must be
  able to promise a watertight solid unconditionally — a preview cannot become
  corrupt mid-drag — so `holeFits` filters it out and `checkPrintability` is
  what tells the user. The geometry tests assert watertightness as a property.

- **Simplification is load-bearing, not polish.** Tracing emits one vertex per
  pixel boundary, so without Douglas-Peucker a 1000px logo yields tens of
  thousands of points: an unusable STL and a stuttering viewer. Note the
  algorithm is **O(n²) when no point is ever within tolerance** (a pure
  zigzag: 8k points ≈ 2s). Real input avoids it — the trace is capped at 512px
  by `MAX_TRACE_DIMENSION`, `removeCollinear` runs first, and `simplifyRing`
  skips Douglas-Peucker entirely at tolerance 0 — but do not feed it an
  uncapped ring.

- **The share page lives at `/designs/[slug]`, outside `/studio`.** `/studio` is
  in `PRIVATE_PREFIXES`; had sharing lived at `/studio/shared/...` every shared
  link would redirect to login — the `/seller` vs `/sellers` bug again, in the
  same hard-to-notice direction. Keep public and private split by path prefix.

- **No image is ever uploaded or stored.** Decoding and tracing happen in the
  browser; only the traced outline and the template parameters are saved. That
  is what makes a shared design renderable for a stranger with no stored
  imagery to moderate — and it means the trace threshold cannot be re-tuned
  after reopening a saved design.

### Testing notes

- **React SSR inserts `<!-- -->` between adjacent text nodes**, so `{n} items`
  renders as `8<!-- --> items`. Assert against stripped text, not raw HTML — this
  produced several false failures.
- `Headers.get()` trims leading/trailing whitespace per RFC 9110, so a token
  with trailing space compares equal. Documented in `lib/payments/xendit.test.ts`
  rather than wished away.
- `curl` in this environment's Git Bash is broken (CA bundle). Use Node's
  `fetch` for HTTP checks.
- The shadcn registry and npm's audit endpoint **intermittently reset
  connections** from this machine. Retry 2–3 times before concluding anything is
  broken.

---

## Conventions

- **`prisma migrate dev`, never `prisma db push`.** Schema changes must produce a
  committed, reviewable migration. `db:push` exists in package.json but is
  unused.
- **Money is integer rupiah.** No floats, no "cents". The DB unit equals
  Xendit's unit so no scaling happens near a payment.
- **The DAL returns DTOs**, built explicitly rather than spread, so adding a
  sensitive column cannot silently widen what callers receive.
- **`Json` columns are Zod-parsed on READ as well as write.** A `Json` column is
  schemaless, so a row written by an older version of the code is untrusted
  input to today's renderer. See `parseStored` in `lib/data/studio.ts`.
- **Seller writes are scoped by `sellerId` from the session**, using
  `updateMany` so a mismatched owner yields `count: 0` instead of touching
  another row. Never take ownership from a request body.
- **User-authored text is stored and rendered as plain text.** No markdown, no
  `dangerouslySetInnerHTML` — rendering seller-authored markup is stored XSS.
- **Pure logic gets unit tests**: the state machine, money arithmetic, webhook
  authentication, upload magic bytes, path matching.
- **Ask before pushing to GitHub** or creating remotes/PRs. Local commits are
  fine.

---

## Commands

```bash
npm run dev          # run in YOUR terminal: dev emails print to stdout
npm run build        # prisma generate && next build
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # vitest, 240 tests
npm run db:migrate   # prisma migrate dev  (NOT db push)
npm run db:seed      # idempotent
npx next typegen     # after adding/moving a route
```

Local dev needs **only `DATABASE_URL`**. Payments default to `MOCK`, email to
`CONSOLE` (links print to the terminal), uploads to `LOCAL`, and the Google
button hides itself when unset.

Seed logins — password `brass-rail-charm-98213`:
`admin@keychain.test`, `mira@keychain.test`, `deni@keychain.test`,
`buyer@keychain.test`.

---

## Deviations from the original plan

All deliberate; do not "correct" them without reading the reason.

| Planned | Actual | Why |
|---|---|---|
| Next.js 15 | **16.3.8** | User asked for latest versions. Brings the `proxy.ts` rename. |
| Midtrans | **Xendit** | User's choice. Changes webhook auth from a SHA512 signature to a static `x-callback-token`, compared in constant time. |
| Prisma 8 | **7.10.0** | `latest` on npm is `8.0.0-rc.20`. A release-candidate ORM is not appropriate here. |
| Local Docker Postgres | **Neon** | User's choice; also sidesteps flaky Docker Hub pulls. `docker-compose.yml` remains as a local option. |
| Real Stripe-style payouts | **In-app ledger only** | Balances and payout requests are tracked; no money leaves the platform. Real disbursement needs KYC. |

---

## State

Working and verified end to end against Neon: catalog, product pages, public
portfolios, auth (including password reset via console email), seller
onboarding, and the gated dashboard. Migrations `20261007010823_init` and
`20261007135835_add_studio_design` are applied; the database is seeded.

**The studio is complete** and verified against a running server: tracing,
extrusion, STL export, saving, reopening, public sharing and admin takedown.
IDOR was probed directly — a stranger requesting another user's
`/studio/designs/<id>` gets a 404 with no title in the body, and a private
design's share link 404s until it is published.

Not yet exercised with real data: the full cart → checkout → webhook → tracker
path, and the admin production queue advancing a live order. Xendit keys are not
yet configured, so payments run on `MOCK`. Nothing has been pushed to a remote.

### Known issues

- **`shadcn` is in `dependencies`, not `devDependencies`.** It drags `ts-morph`
  into the production tree, which trips `npm audit --omit=dev --audit-level=high`
  — so the CI audit job currently fails. It is a CLI; moving it one line fixes
  the audit and shrinks the Docker image.
- **`package-lock.json` was last regenerated on Windows.** It still carries its
  16 Linux `sharp` entries, so it looks fine, but `npm ci` on Linux has not been
  re-verified since (Docker Desktop was not running). See the lockfile gotcha
  above before trusting a Docker or CI build.
