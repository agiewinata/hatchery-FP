# Keychain

A marketplace for custom keychains, acrylic charms, enamel pins and memorabilia
by independent artists.

It supports **two fulfilment models at once**:

- **Print on demand** — an artist uploads artwork, a buyer orders, and *the
  platform* prints and ships it. The artist earns a royalty and holds no stock.
- **Seller stocked** — a seller holds physical stock and posts each order
  themselves.

---

## Quick start

Requires Node 24+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env     # then fill in DATABASE_URL
npm run db:migrate       # create the schema
npm run db:seed          # two artists, eight products, one admin, one buyer
npm run dev
```

Open http://localhost:3000.

**Nothing external is needed to run the whole app.** With the defaults in
`.env.example`:

| Concern | Default in development | Notes |
|---|---|---|
| Payments | `PAYMENT_PROVIDER=MOCK` | A simulated payment page that posts a **real** callback to the real webhook |
| Email | `EMAIL_PROVIDER=CONSOLE` | Password-reset and verification links print to the terminal |
| Uploads | `UPLOAD_PROVIDER=LOCAL` | Files written to `public/uploads` |
| Google OAuth | unset | The button is hidden rather than rendered broken |

Seed accounts all use the password `brass-rail-charm-98213`:

| Email | Role |
|---|---|
| `admin@keychain.test` | Admin — production queue, seller approval |
| `mira@keychain.test` | Seller — four listings |
| `deni@keychain.test` | Seller — four listings |
| `buyer@keychain.test` | Buyer |

### Running Postgres locally

Either point `DATABASE_URL` at [Neon](https://neon.tech) (use the **pooled**
string, whose host contains `-pooler`), or run one in Docker:

```bash
docker compose up -d
# DATABASE_URL="postgresql://keychain:keychain_dev_only@localhost:5432/keychain?schema=public"
```

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, shadcn/ui on Radix primitives |
| Database | PostgreSQL via Prisma 7 with the `pg` driver adapter |
| Auth | Better Auth — email+password and Google OAuth |
| Payments | Xendit hosted invoices (sandbox), behind a provider-agnostic interface |
| Email | Resend in production, console transport in development |
| Uploads | Vercel Blob in production, local disk in development |
| Validation | Zod at every trust boundary |
| Tests | Vitest |
| CI/CD | GitHub Actions → Vercel |

---

## Architecture

### Three rules

Everything else follows from these.

**1. `proxy.ts` does not authorize.** It issues the CSP nonce and redirects
signed-out visitors so they see a login page instead of an error. That is all.
Authorization happens inside the server code that touches data. Next.js
middleware has historically been bypassable (the CVE-2025-29927 class of bug)
and cannot see Server Action invocations at all, so nothing load-bearing may
live there.

**2. Every mutation passes a guard, then a Zod parse.** A page-level check does
*not* protect a Server Action: an action is its own POST endpoint, reachable
without the page ever rendering. So each one re-checks for itself.

**3. Money is never read from the client.** Prices, totals and the gateway
amount are computed server-side from the database at checkout time.

### Layers

```
app/              Pages and route handlers. Thin.
  (shop)/         Storefront, account, seller and admin pages
  (auth)/         Login, register, password reset
  api/            Better Auth handler, payment webhook, upload endpoint
lib/
  data/           DATA ACCESS LAYER - server-only. Authorization lives here.
  actions/        "use server" actions. Guard, parse, delegate to data/.
  payments/       Gateway interface + Xendit and Mock implementations
  orders/         Pure fulfilment state machine
  money.ts        Pure pricing arithmetic
  errors.ts       Typed errors, with zero imports (see note below)
  env.ts          The only reader of process.env
```

The **Data Access Layer** pattern comes from the Next.js data-security guide:
one `server-only` module per domain, authorization checks inside it, and DTOs —
never raw database rows — on the way out.

> `lib/errors.ts` deliberately imports nothing. The error classes are needed on
> both sides of the server/client boundary, and when they lived in `lib/data/*`
> importing them dragged `lib/db.ts` and the Postgres driver into the **browser
> bundle**. The build caught it; keeping that module dependency-free is the fix.

### The hybrid model, without two systems

Both fulfilment types are rows in **one `Product` table**, distinguished by a
`fulfilmentType` discriminator. One catalog, one cart, one checkout. The paths
diverge only *after* payment succeeds:

```
PRINT_ON_DEMAND:  PENDING_PAYMENT → PAID → IN_PRODUCTION → PRINTED
                                  → PACKED → SHIPPED → DELIVERED
SELLER_STOCKED:   PENDING_PAYMENT → PAID → AWAITING_SELLER_SHIPMENT
                                  → SHIPPED → DELIVERED
both:             → CANCELLED | REFUNDED
```

`lib/orders/transitions.ts` is the single authority on whether a move is legal.
It is a pure function, so the admin print queue, the seller's "mark shipped"
button and the payment webhook all share one definition — and it is exhaustively
unit-tested without a database.

### Order tracking

`OrderItemEvent` is **append-only**. The buyer's tracker is a read of those
rows, so it is a real audit trail rather than a guess reconstructed from a
single mutable status column.

### Payment flow

```
checkout action
  → re-read prices from the DB, recompute totals, validate stock
  → reserve stock (compare-and-set), create order, clear cart   [one transaction]
  → ask the gateway for an invoice using the server-computed total
redirect to the gateway's hosted page → buyer pays
POST /api/webhooks/payment
  → authenticate the callback (constant-time token compare) BEFORE parsing it
  → insert WebhookEvent; the unique constraint makes a replay a no-op
  → cross-check the reported amount against our stored total
  → mark paid, branch each item onto its fulfilment path, credit the seller
```

The webhook is the **only** thing that can mark an order paid. The buyer is also
redirected back to us after paying, but that redirect is mere navigation — a
user can type it — so it grants nothing. The tracker's success banner reflects
our own records, not the query string.

Stock is reserved **at checkout**, not at payment, because otherwise two buyers
can both pay for the last item. Reservations are released if payment fails or
expires.

---

## Security

Each control, and where to find it.

| # | Control | Where |
|---|---|---|
| 1 | Password hashing (scrypt); plaintext never stored or logged | Better Auth, `lib/auth.ts` |
| 2 | 12-character minimum, length favoured over composition rules | `lib/auth.ts` |
| 3 | Breached passwords refused via Have I Been Pwned k-anonymity — only the first 5 chars of the SHA-1 hash leave the server | `lib/auth.ts` |
| 4 | Password reset with single-use, expiring, hashed tokens | Better Auth `Verification` table |
| 5 | No account enumeration — sign-in failures and reset requests give identical responses whether or not the account exists | `components/auth-forms.tsx` |
| 6 | Mandatory email verification before selling | `lib/auth.ts`, `app/(shop)/seller/start` |
| 7 | **Privilege escalation blocked**: `role` and `banned` are declared `input: false`, so the update-user endpoint will not accept them. Without this, any signed-in user could POST `{"role":"ADMIN"}` | `lib/auth.ts` |
| 8 | Session cookies `httpOnly` + `secure` + `sameSite=lax`; cookie caching **disabled** so a ban or demotion applies on the next request rather than when a cached cookie expires | `lib/auth.ts` |
| 9 | Rate limiting on sign-in, sign-up and reset, stored **in the database** — an in-memory limiter is useless across serverless instances, since each has its own memory | `lib/auth.ts`, `RateLimit` model |
| 10 | Server-side RBAC on every mutation; hiding a link is never the control | `lib/data/auth.ts` |
| 11 | IDOR prevention — every query scoped by owner (`where: { id, sellerId: me.id }`), using `updateMany` so a mismatched owner yields count 0 instead of touching another row | `lib/data/*` |
| 12 | Order reads scoped by `buyerId`, because order numbers travel in URLs and get shared | `lib/data/orders.ts` |
| 13 | Zod parse at every Server Action and Route Handler boundary | `lib/validation/*` |
| 14 | Payment integrity — server-computed totals, callback authenticated in constant time, amount cross-checked with **no tolerance**, idempotency via a unique constraint | `lib/payments/*`, `lib/data/orders.ts` |
| 15 | Upload safety — type decided by **magic bytes**, not extension or Content-Type; **SVG refused** (it is XML and can carry `<script>`); generated filenames; 5 MB cap; served `Content-Disposition: attachment` | `lib/upload.ts` |
| 16 | Nonce-based CSP with `strict-dynamic`, no `unsafe-inline` in production | `proxy.ts` |
| 17 | HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP | `next.config.ts` |
| 18 | XSS — React auto-escaping; no `dangerouslySetInnerHTML` anywhere; seller bios stored and rendered as **plain text** rather than markup | throughout |
| 19 | External links restricted to `http(s)` so a `javascript:` URL cannot reach an `href`; `rel="noopener noreferrer"` on all of them | `lib/validation/seller.ts` |
| 20 | SQL injection — Prisma parameterised queries only; no `$queryRawUnsafe` | throughout |
| 21 | Open redirect prevention — `?next=` accepted only as a same-site absolute path | `components/auth-forms.tsx` |
| 22 | `next/image` locked to an explicit host allowlist; an open image proxy is an SSRF and bandwidth-abuse vector | `next.config.ts` |
| 23 | Secrets — Zod-validated `env.ts` fails fast at boot; `.env` gitignored and `.dockerignore`d; nothing secret under `NEXT_PUBLIC_` | `lib/env.ts` |
| 24 | CSRF — Better Auth protection plus `serverActions.allowedOrigins`; sign-out is a POST so it cannot be triggered by an `<img>` or a prefetch | `next.config.ts`, `components/sign-out-button.tsx` |
| 25 | Audit log on role changes, seller approval, payouts and status transitions | `AuditLog` model |
| 26 | Errors — typed errors become readable messages; anything unexpected becomes a generic one, so stack traces and query text never reach the browser | `lib/actions/result.ts` |
| 27 | Container runs as a non-root user | `Dockerfile` |
| 28 | CI audits production dependencies and fails on high severity | `.github/workflows/ci.yml` |

### Deliberate trade-offs

- **Nonce-based CSP forces dynamic rendering.** Every page is server-rendered
  per request, which costs caching. Taken knowingly: a strict CSP was worth more
  here than static optimisation.
- **Payouts are recorded, not paid.** Seller balances and payout requests are
  tracked in-app; no money actually leaves the platform. Real disbursement would
  need KYC and a payouts API, which is out of scope.
- **`MOCK` payments and `LOCAL` uploads are refused in production** by
  `lib/env.ts`, which keys off `VERCEL_ENV`/`APP_ENV` rather than `NODE_ENV` —
  `next build` always sets `NODE_ENV=production`, so gating on it would block
  ordinary local and Docker builds while adding no real safety.

---

## Testing

```bash
npm test          # unit tests
npm run typecheck
npm run lint
```

98 unit tests covering the parts where a bug costs money or leaks data:

- **Fulfilment state machine** — the full transition matrix, including that only
  the payment webhook may set `PAID`, that steps cannot be skipped or reversed,
  that terminal states are terminal, and that the two fulfilment paths do not
  leak into each other.
- **Webhook authentication** — missing, wrong, empty, prefix, case-altered and
  whitespace tokens; malformed JSON; missing and non-numeric amounts; replay
  idempotency; and that the body is never parsed before the caller is
  authenticated.
- **Money** — that the commission split never creates or loses a rupiah across a
  spread of awkward prices, and that the gateway amount check accepts no
  tolerance in either direction.
- **Upload validation** — renamed executables, ELF binaries, ZIPs, shell
  scripts, PHP, HTML, SVG (with and without an XML declaration), RIFF
  near-misses, and offset polyglot PNGs.

### Manual checks

The seven features, end to end:

1. Register → the reset link appears in the terminal → reset → sign in.
2. Sign in with Google (needs OAuth keys).
3. Open a shop → an admin approves it at `/admin/sellers` → list one
   print-on-demand and one stocked product.
4. Visit `/sellers/<slug>` signed out — the portfolio is public.
5. As a buyer: add both to the cart → checkout → pay.
6. Watch the tracker. The printed item advances through `/admin/production`; the
   stocked item advances when the seller marks it shipped.
7. Seller earnings reflect the sale; request a payout.

Security checks — each **must** fail closed:

```
Visit /seller/dashboard and /admin/production signed out, and as a plain buyer
PATCH another seller's product by id                 → 403/404, nothing written
Open another user's order by its order number        → denied
Edit a price in devtools, then check out             → server total wins
Replay a payment callback                            → second delivery is a no-op
Send a callback with a bad token                      → 401
Send a callback with a mismatched amount              → rejected, not marked paid
Upload a .svg, and a .exe renamed to .png             → both rejected
curl -I <deployment>                                  → all security headers present
Start the app with a missing env var                  → refuses to boot, says which
```

---

## Deployment

### Vercel

1. Import the repository.
2. Set the environment variables below.
3. Deploy. `npm run build` runs `prisma generate` first.
4. Apply migrations: `npx prisma migrate deploy`.
5. Register the webhook URL in the Xendit dashboard:
   `https://<your-domain>/api/webhooks/payment`

### Docker

```bash
docker build -t keychain-marketplace .
docker run -p 3000:3000 --env-file .env keychain-marketplace
```

Migrations are **not** applied on container start — several replicas racing to
migrate one database is a bad time. Run `npx prisma migrate deploy` as a
separate step.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres. Use Neon's **pooled** string in production |
| `BETTER_AUTH_SECRET` | yes | 32+ chars. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Absolute URL; must be `https://` in production |
| `GOOGLE_CLIENT_ID` / `_SECRET` | no | Omit and the Google button is hidden |
| `PAYMENT_PROVIDER` | no | `MOCK` (default) or `XENDIT`. `MOCK` is refused in production |
| `XENDIT_SECRET_KEY` | if Xendit | Secret API key |
| `XENDIT_CALLBACK_TOKEN` | if Xendit | Webhook verification token |
| `EMAIL_PROVIDER` | no | `CONSOLE` (default) or `RESEND` |
| `RESEND_API_KEY` | if Resend | |
| `EMAIL_FROM` | no | Verified sender address |
| `UPLOAD_PROVIDER` | no | `LOCAL` (default) or `BLOB`. `LOCAL` is refused in production |
| `BLOB_READ_WRITE_TOKEN` | if Blob | Vercel Blob token |
| `ENABLE_PWNED_PASSWORD_CHECK` | no | `true` by default. Needs outbound network at sign-up |
| `APP_ENV` | no | Set to `production` on non-Vercel hosts to enable the production guards |

`lib/env.ts` validates all of this and refuses to start with a message listing
exactly what is wrong, rather than failing later inside a request.

That last part needed `instrumentation.ts` to be true. `lib/env.ts` throws on
invalid config, but Next lazily loads route modules - so in a standalone build
nothing imported it until the first request, and the container would start,
report itself up, then fail per-request. Next's `register()` hook runs once
before the server accepts traffic, so importing `env` there moves the failure
to boot and exits non-zero. Verified both ways:

```
docker run ... (no DATABASE_URL)  -> exit 1, names the missing variable
docker run ... (valid config)     -> healthy, GET /login returns 200
```
