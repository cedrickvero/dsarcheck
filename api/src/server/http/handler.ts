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

export function requestId(req: NextRequest): string {
  const incoming = req.headers.get("x-request-id");
  const id = String(incoming && incoming.length > 0 ? incoming : randomUUID());
  return id.slice(0, 128);
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
