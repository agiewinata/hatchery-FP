import type { NextConfig } from "next";

/**
 * Security headers that are the SAME for every request.
 *
 * Content-Security-Policy is deliberately absent here - it carries a
 * per-request nonce and so is set in proxy.ts instead.
 */
const securityHeaders = [
  {
    // Force HTTPS for two years, including subdomains, and allow browser
    // preloading. Ignored by browsers on plain http://localhost.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Stop MIME sniffing: an uploaded file must never be reinterpreted as
    // executable script because the browser guessed at its type.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Legacy clickjacking defence. CSP frame-ancestors supersedes it, but this
    // still covers older browsers.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Send the full URL only to ourselves; cross-origin requests get the origin
    // only, so order numbers and reset tokens cannot leak via Referer.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // We need none of these. Deny by default.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // Isolate our browsing context from cross-origin windows.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker image can be slim and
  // run without node_modules.
  output: "standalone",

  // Fail the build on type errors rather than shipping them.
  // (Next 16 removed the `eslint` config key; linting runs in CI instead.)
  typescript: { ignoreBuildErrors: false },

  // Do not advertise the framework version to attackers.
  poweredByHeader: false,

  images: {
    // Only these hosts may be proxied through next/image. An open image proxy
    // is an SSRF and bandwidth-abuse vector.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // User-uploaded files are served from here in local development.
        // `attachment` means a browser downloads rather than renders them, so a
        // malicious file cannot execute in our origin.
        source: "/uploads/:path*",
        headers: [
          { key: "Content-Disposition", value: "attachment" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },

  experimental: {
    // Server Actions already compare Origin against Host; this pins the
    // allowed origin explicitly for deployments behind a proxy.
    serverActions: {
      allowedOrigins: process.env.BETTER_AUTH_URL
        ? [new URL(process.env.BETTER_AUTH_URL).host]
        : undefined,
    },
  },
};

export default nextConfig;
