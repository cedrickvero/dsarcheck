/**
 * The middleware as a router, not just as a CSP carrier.
 *
 * These drive the real `middleware()` with a realistic request shape - always a `Host` -
 * and assert the four things the host contract promises: www redirects, the apex path
 * form redirects, a cookie on the wrong surface is refused, and a request that cannot be
 * attributed to a surface is refused rather than treated as a portal.
 */
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

const P = "dsarcheck.com";

interface Mocket {
  host?: string | null;
  pathname?: string;
  search?: string;
  cookie?: string;
}

function run({ host = `acme.${P}`, pathname = "/app", search = "", cookie }: Mocket) {
  const headers = new Headers();
  if (host !== null) headers.set("host", host);
  if (cookie) headers.set("cookie", cookie);
  return middleware({
    nextUrl: { pathname, search, href: `https://${host ?? "unknown"}${pathname}${search}` },
    headers,
  } as unknown as Parameters<typeof middleware>[0]);
}

describe("www", () => {
  it("301s to the apex, preserving path and query", () => {
    const res = run({ host: `www.${P}`, pathname: "/pricing", search: "?plan=agency" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`https://${P}/pricing?plan=agency`);
  });

  it("redirects even when a stray cookie is present", () => {
    // A stale cookie must not turn a permanent redirect into a 401.
    const res = run({ host: `www.${P}`, pathname: "/", cookie: "dsar_session=stale" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`https://${P}/`);
  });

  it("sends www/<slug> to the apex path, which then redirects again", () => {
    const res = run({ host: `www.${P}`, pathname: "/acme/app" });
    expect(res.headers.get("location")).toBe(`https://${P}/acme/app`);
  });
});

describe("apex path form", () => {
  it("301s a tenant path to the subdomain", () => {
    const res = run({ host: P, pathname: "/acme/app/cases", search: "?view=mine" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`https://acme.${P}/app/cases?view=mine`);
  });

  it("leaves real apex routes alone", () => {
    for (const path of ["/", "/pricing", "/privacy"]) {
      const res = run({ host: P, pathname: path });
      expect(res.status, path).not.toBe(301);
    }
  });
});

describe("cookie surfaces", () => {
  it("refuses a staff cookie on a tenant host", () => {
    const res = run({ cookie: "__Host-dsar_staff_session=abc" });
    expect(res.status).toBe(401);
  });

  it("refuses a workspace cookie on the staff console", () => {
    const res = run({ host: `admin.${P}`, cookie: "__Host-dsar_session=abc" });
    expect(res.status).toBe(401);
  });

  it("refuses a workspace cookie on the apex", () => {
    const res = run({ host: P, pathname: "/pricing", cookie: "dsar_session=abc" });
    expect(res.status).toBe(401);
  });

  it("refuses any session cookie when the host cannot be classified", () => {
    const res = run({ host: null, cookie: "dsar_session=abc" });
    expect(res.status).toBe(401);
  });

  it("lets the matching cookie through, on each surface", () => {
    expect(run({ cookie: "dsar_session=abc" }).status).toBe(200);
    expect(run({ host: `admin.${P}`, pathname: "/", cookie: "dsar_staff_session=abc" }).status).toBe(200);
  });

  it("does not mistake a foreign cookie for one of ours", () => {
    // On the console, a cookie that was misread as workspace-scope would be a 401, so a 200
    // here is what proves `_ga` and friends are ignored rather than misattributed.
    expect(run({ host: `admin.${P}`, pathname: "/", cookie: "_ga=1; theme=dark" }).status).toBe(200);
    expect(run({ pathname: "/", cookie: "_ga=1; theme=dark" }).status).toBe(200);
  });
});

describe("security headers", () => {
  it("are applied to redirects as well as pages", () => {
    const redirect = run({ host: `www.${P}`, pathname: "/privacy" });
    expect(redirect.headers.get("x-content-type-options")).toBe("nosniff");
    const page = run({ pathname: "/app" });
    expect(page.headers.get("x-frame-options")).toBe("DENY");
  });
});
