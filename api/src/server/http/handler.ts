import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { NotImplementedError, toErrorEnvelope } from "./errors";

/**
 * Route-handler wrapper.
 *
 * Every handler goes through here so request-id propagation and the JSON error
 * envelope are consistent and a thrown AppError never leaks internals.
 *
 * Server-only: never import this into a client component.
 */
export interface RouteContext {
  params: Promise<Record<string, string | string[]>>;
  requestId: string;
}

export type Handler = (req: NextRequest, ctx: RouteContext) => Promise<Response> | Response;

/**
 * Request ids arrive from the caller and are echoed into a response header and into
 * every log line for the request, so they are treated as untrusted input: an inbound
 * value is accepted ONLY if it is a UUID or a short, boring token. Anything else -
 * too long, control characters, terminal escapes, a JSON blob - is discarded and a
 * fresh id is generated rather than sanitised in place.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const UUID_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestId(req: NextRequest): string {
  const incoming = req.headers.get("x-request-id");
  if (incoming && (UUID_REQUEST_ID.test(incoming) || SAFE_REQUEST_ID.test(incoming))) {
    return incoming;
  }
  return randomUUID();
}

export function route(handler: Handler) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    const id = requestId(req);
    try {
      const res = await handler(req, { params: ctx.params, requestId: id });
      res.headers.set("x-request-id", id);
      return res;
    } catch (err) {
      const { status, body } = toErrorEnvelope(err, id);
      return NextResponse.json(body, { status, headers: { "x-request-id": id } });
    }
  };
}

/** Shared 501 responder for surfaces that are still stubs. */
export function notImplemented(area: string) {
  return route(() => {
    throw new NotImplementedError(area);
  });
}
