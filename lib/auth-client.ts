"use client";

/**
 * Browser-side auth client.
 *
 * No baseURL is passed on purpose: the client defaults to the current origin,
 * so this file carries no configuration and nothing secret. Server-side config
 * lives in lib/auth.ts, which is `server-only`.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;
