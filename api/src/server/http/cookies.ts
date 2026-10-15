/**
 * Cookie attribute policy.
 *
 * No cookie is set yet - authentication arrives in T-08 - so nothing here is wired
 * up. It exists so that when a session cookie IS introduced, the secure flags are the
 * only available shape rather than something a caller must remember.
 *
 * The `__Host-` prefix is doing real work: browsers reject such a cookie unless it is
 * Secure, has no Domain attribute, and has Path=/. That makes a downgrade impossible
 * without renaming the cookie, which is exactly the property we want.
 */
export interface SessionCookie {
  name: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    maxAge: number;
  };
}

export function sessionCookiePolicy(opts: {
  production: boolean;
  maxAgeSeconds?: number;
}): SessionCookie {
  return {
    // `__Host-` requires Secure, so it is only usable in production where the app is
    // served over https. Local development is plain http on localhost.
    name: opts.production ? "__Host-dsar_session" : "dsar_session",
    options: {
      httpOnly: true,
      secure: opts.production,
      sameSite: "lax",
      path: "/",
      maxAge: opts.maxAgeSeconds ?? 60 * 60 * 8,
    },
  };
}
