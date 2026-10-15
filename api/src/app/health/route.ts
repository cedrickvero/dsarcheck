import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { liveness } from "@/server/health";

/** GET /health - liveness. */
export const GET = route(() => NextResponse.json(liveness()));
