/**
 * Which paths the proxy should redirect signed-out visitors away from.
 *
 * Pure, dependency-free, and unit-tested, because getting this wrong is
 * silently destructive in both directions:
 *
 *   - too broad, and public pages disappear behind a login wall (the original
 *     bug: `"/sellers/mira".startsWith("/seller")` is true, so every public
 *     artist portfolio redirected to /login);
 *   - too narrow, and a private page shows an error instead of a login prompt.
 *
 * Note this is a UX concern only. These paths are not *protected* by this
 * function - authorization lives in lib/data/auth.ts and in the route layouts.
 * Getting this list wrong cannot leak data; it can only produce a bad redirect.
 */

/** Signed-out visitors are sent to /login from these path trees. */
export const PRIVATE_PREFIXES = ["/account", "/seller", "/admin"] as const;

/** Signed-in visitors have no reason to see these, so they go to the home page. */
export const AUTH_PAGES = ["/login", "/register", "/forgot-password"] as const;

/**
 * Does `pathname` sit inside `prefix`, respecting path segments?
 *
 * `/seller` matches `/seller` and `/seller/dashboard`, but NOT `/sellers` or
 * `/sellerprofile` - a prefix must end on a segment boundary to count.
 */
export function isUnderPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => isUnderPrefix(pathname, prefix));
}

export function isAuthPage(pathname: string): boolean {
  return (AUTH_PAGES as readonly string[]).includes(pathname);
}
