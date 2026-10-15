/**
 * Security headers, defined once and applied to every route.
 *
 * CSP is deliberately NONCE-FREE (the product owner's option 1):
 *   - Tailwind compiles to static CSS, so no inline styles are required;
 *   - a nonce-based policy needs per-request middleware and only becomes meaningful
 *     once routes actually render, which they do not until T-07+.
 * `script-src 'self'` with no 'unsafe-inline' or 'unsafe-eval' already blocks
 * injected inline script, which is the threat that matters here.
 *
 * Server-only module, but build-time safe: it must stay pure (no env, no node
 * builtins) because next.config.ts imports it.
 */
export interface HeaderPair {
  key: string;
  value: string;
}

/** The policy in one readable place, so a reviewer can diff it as a whole. */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * The full header set. HSTS is production-only: sending it over plain http on
 * localhost would pin a browser to https for the developer's whole machine.
 *
 * `preload` is deliberately withheld until the production domain list exists -
 * submitting to the preload list is effectively irreversible.
 */
export function securityHeaders(opts: { production: boolean }): HeaderPair[] {
  const headers: HeaderPair[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
  if (opts.production) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }
  return headers;
}
