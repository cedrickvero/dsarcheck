/**
 * GET /api/track/sign-out — end a requester session by clearing the cookie. The session row
 * idles out on its own; clearing the cookie is sufficient to drop the credential.
 */
import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { requesterCookieName } from "@/server/portal/requester";

export const GET = route(async (req) => {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const origin = `${forwardedProto === "https" ? "https" : "http"}://${host}`;

  const res = NextResponse.redirect(new URL("/track", origin), 303);
  res.cookies.set(requesterCookieName(), "", { path: "/", maxAge: 0, httpOnly: true });
  return res;
});
