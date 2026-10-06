/**
 * Next.js Proxy (called Middleware before Next 16).
 *
 * ====================================================================
 *  THIS FILE DOES NOT PERFORM AUTHORIZATION.
 * ====================================================================
 *
 * It does exactly two things:
 *   1. Issues a per-request CSP nonce and attaches security headers.
 *   2. Redirects signed-out visitors away from private routes, purely so they
 *      see a login page instead of an error. This is a UX convenience.
 *
 * The cookie check below only asks "does a session cookie EXIST" - it does not
 * validate the signature, look up the session, or read the user's role. Real
 * access control lives in lib/data/auth.ts and runs inside every page, Server
 * Action and Route Handler that touches data.
 *
 * Why so emphatic: Next.js middleware has historically been bypassable
 * (CVE-2025-29927 allowed skipping it with a crafted header), and middleware
 * cannot see Server Action invocations at all. Anything load-bearing must be
 * enforced where the data is actually read or written.
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that are useless when signed out. Redirected for convenience only. */
const PRIVATE_PREFIXES = ["/account", "/seller", "/admin"];

/** Routes a signed-in user has no reason to see. */
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // `strict-dynamic` lets scripts our nonced bundles load run too, so we do
    // not have to enumerate chunk URLs. 'unsafe-eval' is dev-only: React uses
    // eval to rebuild server stack traces in the browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Next injects some inline styles during development HMR.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // Product images come from Vercel Blob; avatars may come from Google.
    "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    // No plugins, ever.
    "object-src 'none'",
    // Stops an injected <base> rewriting every relative URL on the page.
    "base-uri 'self'",
    // Forms may only submit back to us. We send buyers to the payment gateway
    // by redirect, not by cross-origin form POST, so 'self' is sufficient.
    "form-action 'self'",
    // Clickjacking protection, superseding X-Frame-Options.
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const { pathname, search } = request.nextUrl;

  // --- Session-cookie presence check (UX only - see header comment) ---------
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie && PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL("/login", request.url);
    // Preserve where they were going so login can send them back.
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // --- Security headers ----------------------------------------------------
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, isDev);

  // Next reads the nonce off the REQUEST headers and applies it to the script
  // tags it emits, so it must be set on the forwarded request as well as the
  // response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    {
      // Skip static assets and the auth/webhook API routes: they serve no HTML,
      // so a CSP is meaningless, and the webhook must not be redirected.
      source: "/((?!api|_next/static|_next/image|favicon.ico|uploads).*)",
      // Prefetches do not render, so they do not need a nonce.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
