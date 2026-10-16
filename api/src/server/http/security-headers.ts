/**
 * Security headers, defined once and applied to every route.
 *
 * CSP is deliberately NONCE-FREE (the product owner's option 1):
 *   - Tailwind compiles to static CSS, so no inline styles are required;
 *   - a nonce-based policy needs per-request middleware and only becomes meaningful
 *     once routes actually render, which they do not until T-07+.
 * `script-src 'self'${opts.nonce ? ` 'nonce-${opts.nonce}'` : ""}` with no 'unsafe-inline' or 'unsafe-eval' already blocks
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
export function contentSecurityPolicy(opts: { nonce?: string } = {}): string {
  // The nonce is the ONLY way Next's inline bootstrap scripts are permitted to run; there
  // is no fallback to 'unsafe-inline' or 'unsafe-eval'. When no nonce is supplied - the
  // static path, which serves no HTML - the policy stays strict and simply omits it.
  const scriptSrc = opts.nonce ? `script-src 'self' 'nonce-${opts.nonce}'` : "script-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
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

export function securityHeaders(opts: { production: boolean; includeCsp?: boolean; nonce?: string }): HeaderPair[] {
  // includeCsp defaults to true so the R3 contract is unchanged. next.config and the
  // middleware both pass false: the CSP is set per-request by src/middleware.ts, and a
  // second, nonce-free CSP would INTERSECT with the nonce policy in the browser and
  // block the inline scripts the nonce exists to permit.
  const headers: HeaderPair[] = [
    ...(opts.includeCsp === false ? [] : [{ key: "Content-Security-Policy", value: contentSecurityPolicy(opts) }]),
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
