import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { readiness } from "@/server/health";

/** GET /health/ready - readiness: 200 when Postgres is reachable, 503 when it is not. */
export const GET = route(async () => {
  const { status, body } = await readiness();
  return NextResponse.json(body, { status });
});
