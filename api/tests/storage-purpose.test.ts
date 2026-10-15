import { describe, expect, it } from "vitest";
import {
  DOWNLOAD_TTL_CEILING_SECONDS,
  UPLOAD_TTL_CEILING_SECONDS,
  UnknownPurposeError,
  UnknownTtlExceptionError,
  assertPurpose,
  ceilingFor,
  clampTtl,
  isPurpose,
  methodOf,
  operationOf,
  parseTtlExceptions,
  requiredPermission,
  resolveTtlWithException,
} from "@/server/storage/purpose";

describe("purpose allowlist", () => {
  it("accepts allowlisted purposes only", () => {
    expect(isPurpose("evidence")).toBe(true);
    expect(assertPurpose("identity_document")).toBe("identity_document");
  });

  it("rejects a user-controlled purpose", () => {
    for (const candidate of ["payroll", "Evidence", "evidence ", "", "../evidence", "admin"]) {
      expect(isPurpose(candidate)).toBe(false);
    }
    expect(() => assertPurpose("payroll")).toThrow(UnknownPurposeError);
    // and it is a plain string guard: a non-string is refused too
    expect(() => assertPurpose(undefined)).toThrow(UnknownPurposeError);
    expect(() => assertPurpose({ purpose: "evidence" })).toThrow(UnknownPurposeError);
  });

  it("maps operations to methods and back", () => {
    expect(methodOf("upload")).toBe("PUT");
    expect(methodOf("download")).toBe("GET");
    expect(operationOf("PUT")).toBe("upload");
    expect(operationOf("GET")).toBe("download");
  });

  it("requires a distinct permission per operation", () => {
    expect(requiredPermission("evidence", "upload")).toBe("files.upload");
    expect(requiredPermission("evidence", "download")).toBe("files.download");
  });
});

describe("TTL ceilings", () => {
  it("uses 15 minutes for uploads and 10 for downloads", () => {
    expect(UPLOAD_TTL_CEILING_SECONDS).toBe(900);
    expect(DOWNLOAD_TTL_CEILING_SECONDS).toBe(600);
    expect(ceilingFor("evidence", "upload")).toBe(900);
    expect(ceilingFor("evidence", "download")).toBe(600);
  });

  it("clamps a longer request down to the ceiling", () => {
    expect(clampTtl("evidence", "upload", 86400)).toBe(900);
    expect(clampTtl("evidence", "download", 86400)).toBe(600);
  });

  it("honours a shorter request (shortening is always allowed)", () => {
    expect(clampTtl("evidence", "upload", 60)).toBe(60);
  });

  it("defaults to the ceiling when no TTL is requested", () => {
    expect(clampTtl("evidence", "upload")).toBe(900);
    expect(clampTtl("evidence", "download")).toBe(600);
  });

  it("lets a purpose tighten its own ceiling but never loosen it", () => {
    expect(ceilingFor("identity_document", "upload")).toBe(300);
    expect(ceilingFor("identity_document", "download")).toBe(180);
    expect(clampTtl("identity_document", "upload", 900)).toBe(300);
  });

  it("refuses a nonsensical requested TTL", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => clampTtl("evidence", "upload", bad)).toThrow();
    }
  });
});

describe("named TTL exceptions", () => {
  const raw = JSON.stringify([
    { name: "legal-hold-export", purpose: "generated_pack", operation: "download", ttlSeconds: 3600 },
  ]);

  it("parses configured exceptions", () => {
    const map = parseTtlExceptions(raw);
    expect(map.get("legal-hold-export")?.ttlSeconds).toBe(3600);
  });

  it("returns nothing when unset or empty", () => {
    expect(parseTtlExceptions(undefined).size).toBe(0);
    expect(parseTtlExceptions("").size).toBe(0);
  });

  it("fails loudly on malformed configuration", () => {
    expect(() => parseTtlExceptions("{not json")).toThrow(/valid JSON/);
    expect(() => parseTtlExceptions('"a string"')).toThrow(/array/);
    expect(() => parseTtlExceptions('[{"name":"x"}]')).toThrow(/name, purpose and operation/);
    expect(() => parseTtlExceptions('[{"name":"x","purpose":"payroll","operation":"download","ttlSeconds":10}]')).toThrow(
      UnknownPurposeError,
    );
    expect(() => parseTtlExceptions('[{"name":"x","purpose":"evidence","operation":"download","ttlSeconds":0}]')).toThrow(
      /positive integer/,
    );
  });

  it("extends the TTL only for the exact purpose and operation granted", () => {
    const map = parseTtlExceptions(raw);
    const granted = resolveTtlWithException({
      exceptions: map,
      exceptionName: "legal-hold-export",
      purpose: "generated_pack",
      operation: "download",
      requestedSeconds: 7200,
    });
    expect(granted).toEqual({ ttlSeconds: 3600, exceptionName: "legal-hold-export" });
  });

  it("refuses an unknown or mismatched exception (no wildcard)", () => {
    const map = parseTtlExceptions(raw);
    expect(() =>
      resolveTtlWithException({
        exceptions: map,
        exceptionName: "nope",
        purpose: "generated_pack",
        operation: "download",
        requestedSeconds: 7200,
      }),
    ).toThrow(UnknownTtlExceptionError);

    // right name, wrong operation: the exception was not granted for uploads
    expect(() =>
      resolveTtlWithException({
        exceptions: map,
        exceptionName: "legal-hold-export",
        purpose: "generated_pack",
        operation: "upload",
        requestedSeconds: 7200,
      }),
    ).toThrow(/granted for/);

    // right name, wrong purpose
    expect(() =>
      resolveTtlWithException({
        exceptions: map,
        exceptionName: "legal-hold-export",
        purpose: "evidence",
        operation: "download",
        requestedSeconds: 7200,
      }),
    ).toThrow(UnknownTtlExceptionError);
  });

  it("still caps an exception at its own value", () => {
    const map = parseTtlExceptions(raw);
    const out = resolveTtlWithException({
      exceptions: map,
      exceptionName: "legal-hold-export",
      purpose: "generated_pack",
      operation: "download",
      requestedSeconds: 999_999,
    });
    expect(out.ttlSeconds).toBe(3600);
  });
});
