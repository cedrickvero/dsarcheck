import { describe, expect, it } from "vitest";
import { EXCEPTION_TTL_HARD_CAP, parseTtlExceptions, resolveTtlWithException } from "@/server/storage/purpose";

const cfg = (ttlSeconds: number) =>
  JSON.stringify([{ name: "extended", purpose: "evidence", operation: "upload", ttlSeconds }]);

describe("TTL exception bounds (guardrail F-4)", () => {
  it("rejects an exception beyond the hard cap when the config is parsed", () => {
    expect(() => parseTtlExceptions(cfg(EXCEPTION_TTL_HARD_CAP + 1))).toThrow(/hard cap/);
  });

  it("accepts an exception inside the cap", () => {
    const parsed = parseTtlExceptions(cfg(EXCEPTION_TTL_HARD_CAP));
    expect(parsed.get("extended")?.ttlSeconds).toBe(EXCEPTION_TTL_HARD_CAP);
  });

  it("still ignores a blank config", () => {
    expect(parseTtlExceptions("").size).toBe(0);
    expect(parseTtlExceptions(undefined).size).toBe(0);
  });
});

describe("exception branch applies the positive-TTL rule (guardrail F-5)", () => {
  const exceptions = () => parseTtlExceptions(cfg(1800));

  it("refuses a requested TTL of 0 rather than minting an already-expired URL", () => {
    expect(() =>
      resolveTtlWithException({
        exceptions: exceptions(),
        exceptionName: "extended",
        purpose: "evidence",
        operation: "upload",
        requestedSeconds: 0,
      }),
    ).toThrow(/positive/);
  });

  it("refuses a non-finite requested TTL", () => {
    expect(() =>
      resolveTtlWithException({
        exceptions: exceptions(),
        exceptionName: "extended",
        purpose: "evidence",
        operation: "upload",
        requestedSeconds: Number.NaN,
      }),
    ).toThrow(/positive/);
  });

  it("caps the request at the exception's own TTL", () => {
    const out = resolveTtlWithException({
      exceptions: exceptions(),
      exceptionName: "extended",
      purpose: "evidence",
      operation: "upload",
      requestedSeconds: 600000,
    });
    expect(out.ttlSeconds).toBe(1800);
  });

  it("refuses an exception granted for a different operation", () => {
    expect(() =>
      resolveTtlWithException({
        exceptions: exceptions(),
        exceptionName: "extended",
        purpose: "evidence",
        operation: "download",
        requestedSeconds: 1200,
      }),
    ).toThrow(/granted for/);
  });
});
