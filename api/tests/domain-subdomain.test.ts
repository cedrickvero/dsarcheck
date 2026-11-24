import { describe, expect, it } from "vitest";
import { RESERVED_SUBDOMAINS, checkSub } from "@/domain/subdomain";

/**
 * Rules in docs/05 § Portal setup. The distinction that matters: an invalid,
 * reserved or taken name is REFUSED; a valid name that just doesn't match the
 * verified domain is ACCEPTED and queued for review.
 */
describe("checkSub()", () => {
  const domain = "lumen.io";

  it("claims a name that matches the verified domain root", () => {
    const result = checkSub("lumen", domain);
    expect(result).toMatchObject({
      status: "claimed",
      subdomain: "lumen",
      matchesDomain: true,
      message: "",
    });
    expect(result.reason).toBeUndefined();
  });

  it("normalises case and whitespace before judging", () => {
    expect(checkSub("  LUMEN  ", domain).status).toBe("claimed");
  });

  it("claims a name that merely contains the root, or is a prefix of it", () => {
    expect(checkSub("lumen-privacy", domain).status).toBe("claimed");
    expect(checkSub("lum", domain).status).toBe("claimed");
    // Under three characters fails the length rule before the prefix rule runs.
    expect(checkSub("lu", domain)).toMatchObject({ status: "none", reason: "invalid" });
  });

  it("rejects names that break the character rules, with the exact copy", () => {
    const message =
      "Use 3–30 lowercase letters, numbers or hyphens. It can’t start or end with a hyphen.";
    for (const bad of ["ab", "-lumen", "lumen-", "lum_en", "lum en", "a".repeat(31)]) {
      const result = checkSub(bad, domain);
      expect(result.status).toBe("none");
      expect(result.reason).toBe("invalid");
      expect(result.message).toBe(message);
    }
  });

  it("accepts a 3-character and a 30-character name", () => {
    expect(checkSub("abc", domain).reason).toBeUndefined();
    expect(checkSub("a".repeat(30), domain).reason).toBeUndefined();
  });

  it("refuses reserved brand and system names, quoting the name back", () => {
    for (const reserved of ["google", "stripe", "admin", "privacyspace"]) {
      const result = checkSub(reserved, domain);
      expect(result.status).toBe("none");
      expect(result.reason).toBe("reserved");
      expect(result.message).toBe(
        `“${reserved}” is reserved. Brand and system names are protected and can’t be claimed.`,
      );
    }
    expect(RESERVED_SUBDOMAINS).toContain("privacyspace");
  });

  it("refuses a name another workspace already holds", () => {
    const result = checkSub("acme", domain, { taken: ["acme", "nova"] });
    expect(result.status).toBe("none");
    expect(result.reason).toBe("taken");
    expect(result.message).toBe("acme.dsarcheck.com is already in use.");
  });

  it("queues a valid but non-matching name for review, explaining why", () => {
    const result = checkSub("acme", domain);
    expect(result.status).toBe("review");
    expect(result.matchesDomain).toBe(false);
    expect(result.reason).toBeUndefined();
    expect(result.message).toBe(
      "acme.dsarcheck.com doesn’t match your verified domain (lumen.io), " +
        "so a person checks it before it’s released. This usually takes one business day.",
    );
  });

  it("takes the root from a full email address or a bare domain", () => {
    expect(checkSub("lumen", "privacy@lumen.io").status).toBe("claimed");
    expect(checkSub("premium", "premium.example.co.uk").status).toBe("claimed");
  });

  it("honours an extended reserved list from Admin", () => {
    const result = checkSub("acme", domain, { reserved: [...RESERVED_SUBDOMAINS, "acme"] });
    expect(result.reason).toBe("reserved");
  });

  it("never reports claimed for a refused name", () => {
    for (const bad of ["google", "x", "-x-"]) {
      expect(checkSub(bad, domain).status).not.toBe("claimed");
    }
  });
});
