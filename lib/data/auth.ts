/**
 * Authorization guards - the single gate every mutation passes through.
 *
 * This is the heart of the app's access control. The rules it enforces:
 *
 *  1. NOTHING here is reachable from the client. `server-only` guarantees it.
 *  2. Guards THROW rather than return a flag, so a caller that forgets to check
 *     a boolean fails closed instead of silently proceeding.
 *  3. Guards return DTOs, never raw Prisma rows, so password hashes and other
 *     internal columns can never be handed to a Client Component.
 *  4. `proxy.ts` does NOT authorize. It only redirects for UX. Authorization
 *     happens here, inside the server code that touches data - which is the
 *     only place that cannot be bypassed (see CVE-2025-29927 for why
 *     middleware-based authz is unsafe).
 *
 * Page-level checks do NOT protect Server Actions: an action is a separate POST
 * entry point, so it must call a guard of its own. Every action in this codebase
 * starts with one.
 */
import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import type { UserRole } from "@/lib/generated/prisma/enums";

// Re-exported for convenience so DAL consumers have one import site.
export { ForbiddenError, UnauthenticatedError };

/**
 * The only shape of "current user" the rest of the app ever sees.
 * Note the absence of anything sensitive - no password hash, no tokens.
 */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: UserRole;
}

/**
 * Read the session once per request.
 *
 * `cache()` dedupes across the whole render pass, so a layout, a page and three
 * components can each ask "who is this?" without five database round-trips, and
 * without us threading the user through props (which is how data accidentally
 * reaches Client Components).
 */
const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Current user, or null when signed out.
 *
 * Re-reads `role` and `banned` from the database rather than trusting the
 * session payload, so a ban or a role change takes effect on the very next
 * request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      banned: true,
    },
  });

  // Banned users are treated as signed out everywhere, immediately.
  if (!user || user.banned) return null;

  // Built explicitly rather than spread, so adding a sensitive column to the
  // User model can never silently widen what callers receive.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    role: user.role,
  };
});

/** Throws unless signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Throws unless signed in AND email-verified. */
export async function requireVerifiedUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.emailVerified) {
    throw new ForbiddenError("Please confirm your email address first.");
  }
  return user;
}

/** Throws unless the user holds one of `roles`. ADMIN is not implicitly included. */
export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  return requireRole("ADMIN");
}

export interface SellerContext {
  user: CurrentUser;
  seller: { id: string; slug: string; displayName: string; isApproved: boolean };
}

/**
 * Throws unless the user has a seller profile.
 *
 * Returns the seller's own id, which callers MUST scope their queries by
 * (`where: { id, sellerId: seller.id }`) so a seller can only ever touch their
 * own products and orders. That scoping is what prevents IDOR.
 */
export async function requireSeller(): Promise<SellerContext> {
  const user = await requireVerifiedUser();

  const seller = await db.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, slug: true, displayName: true, isApproved: true },
  });

  if (!seller) throw new ForbiddenError("You do not have a seller profile yet.");
  return { user, seller };
}

/**
 * As `requireSeller`, but also demands admin approval.
 * Used for actions that make a listing publicly visible.
 */
export async function requireApprovedSeller(): Promise<SellerContext> {
  const ctx = await requireSeller();
  if (!ctx.seller.isApproved) {
    throw new ForbiddenError("Your seller account is awaiting approval.");
  }
  return ctx;
}
