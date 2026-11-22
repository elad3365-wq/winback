import type { NextConfig } from "next";

/**
 * Security headers on every response.
 *
 * - The CSP is deliberately narrow: it blocks other sites from framing WinBack
 *   (clickjacking), plugins, and <base> tag hijacking. It does not restrict
 *   scripts yet, because Next.js inlines bootstrap scripts; a nonce-based
 *   script policy is a later step.
 * - HSTS: Vercel serves HTTPS only; this tells browsers never to try HTTP.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
