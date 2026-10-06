/**
 * Validated environment configuration.
 *
 * SECURITY: this module is the ONLY place that reads `process.env`.
 * Everything else imports the typed `env` object from here. That gives us:
 *   - fail-fast at boot on missing/malformed config, instead of a confusing
 *     runtime error (or worse, a silent insecure default) deep in a request;
 *   - one audited place where secrets enter the process;
 *   - `server-only`, so importing this from a Client Component is a build error
 *     and secrets can never be bundled into client JS.
 */
import "server-only";
import { z } from "zod";

const providerPair = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values);

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // --- Database ---
    DATABASE_URL: z
      .string()
      .min(1, { error: "DATABASE_URL is required (Neon pooled connection string)." })
      .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
        error: "DATABASE_URL must be a postgres:// or postgresql:// URL.",
      }),

    // --- Auth ---
    // 32 bytes of entropy minimum: this key signs session cookies, so a weak
    // value would let an attacker forge sessions.
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, { error: "BETTER_AUTH_SECRET must be >=32 chars. Generate: openssl rand -base64 32" }),
    BETTER_AUTH_URL: z.url({ error: "BETTER_AUTH_URL must be an absolute URL." }),

    GOOGLE_CLIENT_ID: z.string().default(""),
    GOOGLE_CLIENT_SECRET: z.string().default(""),

    /// Reject passwords found in the Have I Been Pwned breach corpus.
    /// Privacy-preserving (k-anonymity: only the first 5 chars of the SHA-1
    /// hash are sent), but it DOES require outbound network access during
    /// sign-up and password reset. Set to "false" if that is unreliable.
    ENABLE_PWNED_PASSWORD_CHECK: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),

    // --- Payments ---
    PAYMENT_PROVIDER: providerPair(["MOCK", "XENDIT"]).default("MOCK"),
    XENDIT_SECRET_KEY: z.string().default(""),
    /// Xendit verifies callbacks with a static token in the `x-callback-token`
    /// header. We compare it in constant time (see lib/payments/xendit.ts).
    XENDIT_CALLBACK_TOKEN: z.string().default(""),

    // --- Email ---
    EMAIL_PROVIDER: providerPair(["CONSOLE", "RESEND"]).default("CONSOLE"),
    RESEND_API_KEY: z.string().default(""),
    EMAIL_FROM: z.string().default("onboarding@resend.dev"),

    // --- Uploads ---
    UPLOAD_PROVIDER: providerPair(["LOCAL", "BLOB"]).default("LOCAL"),
    BLOB_READ_WRITE_TOKEN: z.string().default(""),
  })
  // Conditional requirements: a provider is only selectable if its credentials
  // are actually present. This stops a deploy that *looks* configured but would
  // fail (or silently fall back to an insecure stub) on first use.
  .superRefine((cfg, ctx) => {
    const require = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: [path], message });
    };

    if (cfg.PAYMENT_PROVIDER === "XENDIT") {
      require(!!cfg.XENDIT_SECRET_KEY, "XENDIT_SECRET_KEY", "Required when PAYMENT_PROVIDER=XENDIT.");
      // Without this, we cannot authenticate callbacks - anyone who learns the
      // webhook URL could mark arbitrary orders as paid.
      require(
        !!cfg.XENDIT_CALLBACK_TOKEN,
        "XENDIT_CALLBACK_TOKEN",
        "Required when PAYMENT_PROVIDER=XENDIT (webhook authentication).",
      );
    }
    if (cfg.EMAIL_PROVIDER === "RESEND") {
      require(!!cfg.RESEND_API_KEY, "RESEND_API_KEY", "Required when EMAIL_PROVIDER=RESEND.");
    }
    if (cfg.UPLOAD_PROVIDER === "BLOB") {
      require(!!cfg.BLOB_READ_WRITE_TOKEN, "BLOB_READ_WRITE_TOKEN", "Required when UPLOAD_PROVIDER=BLOB.");
    }

    // Production must not run on the dev-only stubs.
    if (cfg.NODE_ENV === "production") {
      require(cfg.PAYMENT_PROVIDER !== "MOCK", "PAYMENT_PROVIDER", "MOCK payments are forbidden in production.");
      require(cfg.UPLOAD_PROVIDER !== "LOCAL", "UPLOAD_PROVIDER", "LOCAL uploads are not durable in production; use BLOB.");
      require(cfg.BETTER_AUTH_URL.startsWith("https://"), "BETTER_AUTH_URL", "Must be https:// in production.");
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  // Throwing here intentionally prevents the app from starting.
  throw new Error(
    `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the values.`,
  );
}

export const env = parsed.data;

/** Google OAuth is optional in development; the UI hides the button when unset. */
export const isGoogleOAuthEnabled =
  env.GOOGLE_CLIENT_ID.length > 0 && env.GOOGLE_CLIENT_SECRET.length > 0;
