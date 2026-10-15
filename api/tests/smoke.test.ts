import { describe, expect, it } from "vitest";
import { isFrozen, now } from "../src/domain/clock";
import { caseReference } from "../src/lib/ids";
import { env } from "../src/env";

/**
 * Scaffold smoke tests.
 *
 * Deliberately framework-agnostic: these must keep passing across the
 * Express -> Next.js conversion and after the legacy files are removed.
 */
describe("scaffold", () => {
  it("resolves validated env with defaults", () => {
    expect(env.NODE_ENV).toBeTruthy();
    expect(typeof env.PORT).toBe("number");
  });

  it("formats case references", () => {
    expect(caseReference(2026, 418)).toBe("DSAR-2026-00418");
  });

  it("clock returns a Date and reports frozen state", () => {
    expect(now()).toBeInstanceOf(Date);
    expect(typeof isFrozen()).toBe("boolean");
  });
});
