import { describe, expect, it } from "vitest";
import {
  InvalidObjectKeyError,
  assertKeyInWorkspace,
  buildObjectKey,
  parseObjectKey,
} from "@/server/storage/objectKey";

const WS_A = "5874fc56-e880-4ad8-ba37-61f121332fe7";
const WS_B = "0c99258b-9fc0-4aa0-a10d-9d77b6d95686";
const ID = "7be1b6bf-bd8f-421e-a7c6-27d42d184ca9";

describe("object keys", () => {
  it("builds ws/<workspaceId>/<purpose>/<uuid>", () => {
    const key = buildObjectKey({ workspaceId: WS_A, purpose: "evidence" });
    expect(key).toMatch(/^ws\/[0-9a-f-]{36}\/evidence\/[0-9a-f-]{36}$/);
    expect(key.startsWith(`ws/${WS_A}/`)).toBe(true);
  });

  it("accepts a supplied id and rejects a non-UUID one", () => {
    expect(buildObjectKey({ workspaceId: WS_A, purpose: "evidence", id: ID })).toBe(
      `ws/${WS_A}/evidence/${ID}`,
    );
    expect(() => buildObjectKey({ workspaceId: WS_A, purpose: "evidence", id: "not-a-uuid" })).toThrow(
      InvalidObjectKeyError,
    );
  });

  it("round-trips through parse", () => {
    const parts = parseObjectKey(`ws/${WS_A}/identity_document/${ID}`);
    expect(parts).toEqual({ workspaceId: WS_A, purpose: "identity_document", id: ID });
  });

  describe("cross-workspace keys are rejected", () => {
    it("refuses a well-formed key that belongs to another workspace", () => {
      const otherTenantsKey = `ws/${WS_B}/evidence/${ID}`;
      expect(() => assertKeyInWorkspace(otherTenantsKey, WS_A)).toThrow(InvalidObjectKeyError);
      expect(() => assertKeyInWorkspace(otherTenantsKey, WS_A)).toThrow(/different workspace/);
      // the same key is fine for its real owner - the check is tenancy, not syntax
      expect(assertKeyInWorkspace(otherTenantsKey, WS_B).workspaceId).toBe(WS_B);
    });

    it("refuses a key whose prefix disagrees with its parsed workspace (defence in depth)", () => {
      // "ws" repeated so the prefix cannot match, while the parsed workspace still can
      const sneaky = `ws/ws/${WS_A}/${ID}`;
      expect(() => parseObjectKey(sneaky)).toThrow(InvalidObjectKeyError);
    });
  });

  describe("malformed keys are rejected", () => {
    const bad: Array<[string, string]> = [
      ["path traversal - parent", `ws/${WS_A}/evidence/..`],
      ["path traversal - embedded parent", `ws/${WS_A}/../evidence/${ID}`],
      ["path traversal - current dir", `ws/${WS_A}/./evidence/${ID}`],
      ["empty segment", `ws//evidence/${ID}`],
      ["empty purpose", `ws/${WS_A}//${ID}`],
      ["too few segments", `ws/${WS_A}/evidence`],
      ["too many segments", `ws/${WS_A}/evidence/${ID}/extra`],
      ["absolute path smuggling", `/etc/passwd`],
      ["Windows-style separator", `ws\\${WS_A}\\evidence\\${ID}`],
      ["trailing slash", `ws/${WS_A}/evidence/`],
      ["bad namespace", `objects/${WS_A}/evidence/${ID}`],
      ["malformed uuid - short", `ws/${WS_A}/evidence/abc`],
      ["malformed uuid - non-hex", `ws/${WS_A}/evidence/zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz`],
      ["malformed workspace uuid", `ws/not-a-uuid/evidence/${ID}`],
      ["empty", ""],
      ["null byte", `ws/${WS_A}/evidence/${ID}\u0000`],
    ];
    for (const [label, key] of bad) {
      it(`rejects ${label}`, () => {
        expect(() => parseObjectKey(key)).toThrow(InvalidObjectKeyError);
      });
    }
  });

  it("rejects an unknown purpose in the key", () => {
    expect(() => parseObjectKey(`ws/${WS_A}/payroll/${ID}`)).toThrow(/allowlist/);
  });
});
