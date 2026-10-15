import { describe, expect, it, vi } from "vitest";
import {
  NotImplementedError,
  ValidationError,
  sanitizeMessage,
  toErrorEnvelope,
} from "@/server/http/errors";

describe("error envelope never leaks internals", () => {
  it("replaces an unrecognised failure with a generic message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = toErrorEnvelope(
      new Error(
        "connect ECONNREFUSED 127.0.0.1:5432 postgres://app:sup3rsecret@db:5432/dsar at /workspace/api/src/db/client.ts:41",
      ),
      "req-1",
    );
    spy.mockRestore();

    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe("Internal server error");
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/ECONNREFUSED/);
    expect(serialised).not.toMatch(/postgres:\/\//);
    expect(serialised).not.toMatch(/sup3rsecret/);
    expect(serialised).not.toMatch(/client\.ts/);
  });

  it("does not log an error for an intentional 501 stub (O5)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = toErrorEnvelope(new NotImplementedError("files"), "req-2");
    expect(spy, "a 501 stub was logged as an error").not.toHaveBeenCalled();
    spy.mockRestore();
    expect(status).toBe(501);
    expect(body.error.code).toBe("not_implemented");
  });

  it("still logs an unexpected failure loudly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toErrorEnvelope(new Error("boom"), "req-3");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not log a 4xx", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toErrorEnvelope(new ValidationError("bad value"), "req-4");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("strips control characters from an authored message", () => {
    const hostile = `bad${String.fromCharCode(10)}value${String.fromCharCode(27)}[31mred`;
    expect(sanitizeMessage(hostile)).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
  });

  it("caps an over-long authored message", () => {
    expect(sanitizeMessage("x".repeat(5000)).length).toBeLessThanOrEqual(300);
  });
});
