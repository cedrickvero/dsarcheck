/**
 * Signed links for evidence-pack artifacts (Option 3 storage slice).
 *
 * A link is a 24-hour, single-use token bound to ONE evidence-pack version, its workspace,
 * the issuer, a recipient type, an expiry and a content hash (of the deterministic PDF).
 * The token is stored ONLY as a SHA-256 hash. Consumption is an atomic UPDATE guarded by
 * `consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, so concurrent or
 * repeated use fails after the first success.
 *
 * Every tenant-known outcome is audited (issuance, consumption, and the specific denial:
 * expired / revoked / replayed). A token that does not resolve to a row returns "invalid"
 * with no audit row (there is no tenant to write into) and is indistinguishable from a
 * valid-but-denied link to the caller.
 */
import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { signedLinks, evidencePacks } from "@/db/schema";
import { withLookup, withTenant } from "@/db/client";
import { can } from "@/server/authz";
import { writeAuditEvent } from "@/server/db/audit";
import { ForbiddenError, ValidationError } from "@/server/http/errors";
import { newToken, hashToken } from "@/server/auth/crypto";
import { renderEvidencePackPdf } from "./evidence-pdf";
import type { EvidencePackData } from "@/domain/evidence";
import type { Actor } from "@/server/auth/require-auth";

const LINK_TTL_HOURS = 24;
const RECIPIENT_ACTOR = "signed-link-recipient";

function contentHashOf(pdf: Uint8Array): string {
  return createHash("sha256").update(pdf).digest("hex");
}

export interface IssueLinkResult {
  token: string;
  expiresAt: Date;
  contentHash: string;
}

/** Issue a signed link for one evidence-pack version. RBAC + RLS + audit in one transaction. */
export async function issueSignedLink(
  actor: Actor,
  args: { artifactId: string; recipientType: string; reason: string },
): Promise<IssueLinkResult> {
  return withTenant(
    { orgId: actor.orgId, workspaceId: actor.workspaceId, actorId: actor.userId },
    async (tx) => {
      if (!actor.roles.some((r) => can(r, "export_evidence_packs"))) {
        throw new ForbiddenError("Your role does not permit issuing evidence-pack links.");
      }
      const [pack] = await tx
        .select({ content: evidencePacks.content })
        .from(evidencePacks)
        .where(and(eq(evidencePacks.id, args.artifactId), eq(evidencePacks.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!pack) throw new ValidationError("unknown evidence pack");

      const pdf = renderEvidencePackPdf(pack.content as EvidencePackData);
      const contentHash = contentHashOf(pdf);
      const token = newToken();
      const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 3600_000);

      await tx.insert(signedLinks).values({
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        artifactType: "evidence_pack",
        artifactId: args.artifactId,
        tokenHash: hashToken(token),
        issuedBy: actor.userId,
        recipientType: args.recipientType,
        contentHash,
        expiresAt,
      });

      await writeAuditEvent(tx, {
        orgId: actor.orgId,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        actorLabel: actor.label,
        action: "Evidence link issued",
        category: "Evidence",
        reason: args.reason,
        objectType: "signed_link",
        objectId: args.artifactId,
        meta: { artifactId: args.artifactId, recipientType: args.recipientType, expiresAt: expiresAt.toISOString(), contentHash },
      });

      return { token, expiresAt, contentHash };
    },
  );
}

export type ConsumeResult =
  | { status: "invalid" }
  | { status: "denied"; reason: "expired" | "revoked" | "replayed" }
  | { status: "ok"; orgId: string; artifactId: string; workspaceId: string; contentHash: string };

/** Validate + atomically consume a presented token. Audits every tenant-known outcome. */
export async function consumeSignedLink(token: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);
  return withLookup({ signedLinkTokenHash: tokenHash }, async (tx) => {
    const now = new Date();

    // Atomic single-use claim — the ONLY consumption gate. The UPDATE predicate is the full
    // validity check (unconsumed, unrevoked, unexpired), so concurrent consumers race here and
    // exactly one wins. No pre-check above this, or tests would only exercise the fast path.
    const claimed = await tx
      .update(signedLinks)
      .set({ consumedAt: now })
      .where(
        and(
          eq(signedLinks.tokenHash, tokenHash),
          isNull(signedLinks.consumedAt),
          isNull(signedLinks.revokedAt),
          gt(signedLinks.expiresAt, now),
        ),
      )
      .returning({
        id: signedLinks.id,
        orgId: signedLinks.orgId,
        workspaceId: signedLinks.workspaceId,
        artifactId: signedLinks.artifactId,
        contentHash: signedLinks.contentHash,
      });

    if (claimed.length > 0) {
      const row = claimed[0]!;
      await tx.execute(sql`select set_config('app.workspace_id', ${row.workspaceId}, true)`);
      await writeAuditEvent(tx, {
        orgId: row.orgId,
        workspaceId: row.workspaceId,
        actorId: RECIPIENT_ACTOR,
        actorLabel: "Signed link recipient",
        action: "Evidence link consumed",
        category: "Evidence",
        reason: "Signed link consumed",
        objectType: "signed_link",
        objectId: row.artifactId,
        meta: { artifactId: row.artifactId, contentHash: row.contentHash, outcome: "consumed" },
      });
      return { status: "ok", orgId: row.orgId, artifactId: row.artifactId, workspaceId: row.workspaceId, contentHash: row.contentHash };
    }

    // Claim lost — resolve WHY for the audit (invalid vs expired/revoked/replayed).
    const [after] = await tx
      .select({
        orgId: signedLinks.orgId,
        workspaceId: signedLinks.workspaceId,
        artifactId: signedLinks.artifactId,
        consumedAt: signedLinks.consumedAt,
        revokedAt: signedLinks.revokedAt,
        expiresAt: signedLinks.expiresAt,
      })
      .from(signedLinks)
      .where(eq(signedLinks.tokenHash, tokenHash))
      .limit(1);
    if (!after) return { status: "invalid" } as const;

    await tx.execute(sql`select set_config('app.workspace_id', ${after.workspaceId}, true)`);
    const reason: "expired" | "revoked" | "replayed" = after.revokedAt
      ? "revoked"
      : after.consumedAt
        ? "replayed"
        : after.expiresAt <= now
          ? "expired"
          : "replayed";

    await writeAuditEvent(tx, {
      orgId: after.orgId,
      workspaceId: after.workspaceId,
      actorId: RECIPIENT_ACTOR,
      actorLabel: "Signed link recipient",
      action: "Evidence link denied",
      category: "Evidence",
      reason: `Signed link ${reason}`,
      objectType: "signed_link",
      objectId: after.artifactId,
      meta: { artifactId: after.artifactId, outcome: reason },
    });
    return { status: "denied", reason };
  });
}
