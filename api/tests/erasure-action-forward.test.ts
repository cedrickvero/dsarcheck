/**
 * The erasure server-action boundary: the "Outcome record attached" checkbox must survive
 * the action wrapper. If the action drops hasOutcomeRecord, the server fn sees undefined
 * and the evidence rule rejects deleted/suppressed/retained_under_exception/not_found —
 * only action_required would be recordable end-to-end. This is enforced mechanically at
 * the forward site (the action is a thin re-auth + revalidate wrapper; the logic itself
 * is tested in cases-erasure.test.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const actionSource = () => readFileSync("src/app/app/cases/actions.ts", "utf8");

function recordErasureActionBody(): string {
  const src = actionSource();
  const start = src.indexOf("export async function recordErasureOutcome");
  expect(start).toBeGreaterThanOrEqual(0);
  const nextExport = src.indexOf("export async function", start + 10);
  return src.slice(start, nextExport === -1 ? src.length : nextExport);
}

describe("erasure server-action boundary", () => {
  it("declares hasOutcomeRecord and forwards it to the server fn", () => {
    const body = recordErasureActionBody();
    expect(body).toContain("hasOutcomeRecord?: boolean");
    expect(body).toMatch(/hasOutcomeRecord:\s*input\.hasOutcomeRecord/);
  });
});
