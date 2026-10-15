import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { requestId } from "@/server/http/handler";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reqWith(value: string | null): NextRequest {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "x-request-id" ? value : null),
    },
  } as unknown as NextRequest;
}

describe("request id is treated as untrusted input", () => {
  it("accepts a uuid and a boring token", () => {
    const uuid = "3f0e1c22-9a11-4b33-8c44-556677889900";
    expect(requestId(reqWith(uuid))).toBe(uuid);
    expect(requestId(reqWith("traced-abc-123"))).toBe("traced-abc-123");
  });

  it("generates a fresh id when the header is absent", () => {
    expect(requestId(reqWith(null))).toMatch(UUID);
  });

  it("refuses hostile or malformed values rather than sanitising in place", () => {
    const hostile = [
      "",
      "short",
      "x".repeat(200),
      `bad${String.fromCharCode(10)}injected: header`,
      `ansi${String.fromCharCode(27)}[31m`,
      `cr${String.fromCharCode(13)}lf`,
      '{"json":true}',
      "id with spaces",
      "semi;colon",
      "../../etc/passwd",
    ];
    for (const value of hostile) {
      const got = requestId(reqWith(value));
      expect(got, `echoed a hostile request id: ${JSON.stringify(value)}`).not.toBe(value);
      expect(got).toMatch(UUID);
    }
  });
});
