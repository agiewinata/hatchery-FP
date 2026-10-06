/**
 * Better Auth server configuration.
 *
 * Deliberately uses a library rather than hand-rolled auth: password hashing,
 * single-use expiring reset tokens, session rotation and CSRF protection are
 * exactly the places where bespoke implementations leak.
 *
 * Every security-relevant choice below is commented with its reasoning.
 */
import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";

import { db } from "./db";
import { passwordResetEmail, sendEmail, verificationEmail } from "./email";
import { env, isGoogleOAuthEnabled } from "./env";

const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * ONE_HOUR;

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
    // Postgres supports transactions; enabling them keeps multi-table auth
    // writes (user + account) atomic so a crash cannot leave a user with no
    // credential row.
    transaction: true,
  }),

  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  // Server Actions and the auth endpoints both reject cross-origin POSTs.
  trustedOrigins: [env.BETTER_AUTH_URL],

  emailAndPassword: {
    enabled: true,
    // Unverified accounts cannot sign in. Stops throwaway/typo'd addresses from
    // holding a seller storefront, and makes the reset flow meaningful.
    requireEmailVerification: true,
    // NIST SP 800-63B favours length over composition rules: a long passphrase
    // beats a short password with forced symbols.
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: ONE_HOUR,

    sendResetPassword: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...passwordResetEmail(url) });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: ONE_HOUR,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...verificationEmail(url) });
    },
  },

  // Google is optional: in development with no keys the UI hides the button
  // rather than rendering one that 500s.
  socialProviders: isGoogleOAuthEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {},

  user: {
    additionalFields: {
      // SECURITY - `input: false` is load-bearing.
      //
      // Better Auth exposes an update-user endpoint that accepts any field
      // declared as user input. Without `input: false`, ANY signed-in user
      // could POST {"role":"ADMIN"} and escalate their own privileges. These
      // two fields are writable only by server-side code that we control.
      role: {
        type: "string",
        defaultValue: "BUYER",
        input: false,
      },
      banned: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },

  session: {
    expiresIn: 7 * ONE_DAY,
    // Sliding window: an active user stays signed in without a 7-day hard cutoff.
    updateAge: ONE_DAY,
    // SECURITY: cookie caching is deliberately OFF. It would serve the session
    // (including `role` and `banned`) from a signed cookie for its TTL, so an
    // admin banning a user or demoting a seller would not take effect until the
    // cache expired. Validating against the database on each request costs one
    // indexed query and makes revocation immediate.
    cookieCache: { enabled: false },
  },

  rateLimit: {
    enabled: true,
    // Database-backed so the limit is shared across serverless instances.
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      // Credential stuffing / brute force.
      "/sign-in/email": { window: 60, max: 5 },
      // Account-creation spam.
      "/sign-up/email": { window: ONE_HOUR, max: 5 },
      // Reset-email flooding (someone harassing a known address).
      "/request-password-reset": { window: ONE_HOUR, max: 3 },
      "/reset-password": { window: ONE_HOUR, max: 5 },
      "/send-verification-email": { window: ONE_HOUR, max: 3 },
    },
  },

  // A long password is no good if it is already in a breach corpus. The check
  // uses k-anonymity: only the first 5 characters of the password's SHA-1 hash
  // leave this server, never the password. Toggleable because it needs network
  // access at sign-up time.
  plugins: env.ENABLE_PWNED_PASSWORD_CHECK
    ? [
        haveIBeenPwned({
          customPasswordCompromisedMessage:
            "This password has appeared in a known data breach. Please choose a different one.",
        }),
      ]
    : [],

  advanced: {
    // Secure cookies require HTTPS, which localhost does not have.
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      // `lax` (not `strict`) so the Google OAuth redirect back to our site
      // still carries the cookie, while cross-site POSTs do not.
      sameSite: "lax",
    },
  },
});

export type Session = typeof auth.$Infer.Session;
