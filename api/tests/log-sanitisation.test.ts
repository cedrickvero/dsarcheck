import { describe, expect, it, vi } from "vitest";
import { describeError, logError, safeMessage } from "@/server/log";

/**
 * FINDING A: the five logging sites passed RAW error objects to console.error. A Drizzle/pg
 * error carries the literal SQL, its bound parameter array (here: the human-entered reason
 * and the object key), schema/table/constraint names, a Postgres C source file, and a stack
 * trace with repository paths. These tests assert the log line is a sanitised summary and
 * that nothing else is handed to the logger at all.
 */
describe("log sanitisation (FINDING A)", () => {
  it("logs a summary and never the raw error object", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error(
      'Failed query: insert into "audit_events" ("reason") values ($1) [probe reason text]',
    );
    Object.assign(err, { code: "23503" });
    Object.assign(err, { cause: { code: "23503", constraint: "audit_events_workspace_fk", table: "audit_events", file: "ri_triggers.c", routine: "ri_ReportViolation" } });

    logError("audit-write-failed", err, { requestId: "req-1" });

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0]!;
    // exactly ONE argument: a raw object can never reach the logger
    expect(call).toHaveLength(1);
    const line = String(call[0]);
    expect(line).toContain("audit-write-failed");
    expect(line).toContain("code=23503");
    expect(line).toContain("constraint=audit_events_workspace_fk");
    expect(line).toContain("requestId=req-1");
    expect(line).toContain("message=redacted");
    // and nothing internal
    expect(line).not.toMatch(/insert into|values \(|ri_triggers\.c|probe reason text/);
    expect(line).not.toMatch(/\s+at\s+.*\(.*:\d+:\d+\)/);
    spy.mockRestore();
  });

  it("redacts a message that could carry SQL, a DSN, a bound parameter or a credential", () => {
    for (const risky of [
      "insert into audit_events values ($1)",
      "connect ECONNREFUSED postgres://app:secret@db:5432/dsar",
      "unauthorized token=bearer abc",
      "invalid input for user alice@example.com",
      "x".repeat(500),
      "",
    ]) {
      expect(safeMessage(risky), `leaked: ${risky.slice(0, 40)}`).toBeNull();
    }
  });

  it("keeps a genuinely safe message so incidents stay diagnosable", () => {
    expect(safeMessage("permission store unreachable")).toBe("permission store unreachable");
  });

  it("strips control characters and never emits a stack", () => {
    const err = new Error("bad" + String.fromCharCode(10) + "value" + String.fromCharCode(27) + "[31m");
    const described = describeError(err);
    expect(described).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(described).not.toMatch(/\s+at\s/);
  });
});
