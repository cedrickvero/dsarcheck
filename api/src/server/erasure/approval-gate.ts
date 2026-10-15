/**
 * The human approval gate for erasure decisions.
 *
 * Every rule here exists to make ONE thing structurally impossible: a decision made
 * without a named human, or a decision approved by someone who should not have approved
 * it. There is no "System" path, no bypass flag, and no environment that relaxes any of
 * these - separation of duties is a property of the contract, not of the deployment.
 *
 * Server-only.
 */
import { AppError, ValidationError } from "@/server/http/errors";
import type { Actor, Role } from "@/server/auth/require-auth";
import { systemsBlockingApproval, type SystemOutcomeState } from "./policy";

export type DecisionRisk = "standard" | "high";

/** Actor ids that must never be able to decide or approve a destructive outcome. */
const NON_HUMAN_ACTOR_IDS = ["system", "automated", "worker", "cron", "scheduler", "job"] as const;

/**
 * "The deciding actor must be a named human actor." Also the enforcement point for "no
 * autonomous deletion": a system/worker/cron actor is refused here, so no queue, job or
 * integration can record a destructive outcome on its own initiative.
 */
export function assertNamedHumanActor(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor) {
    throw new ValidationError("an erasure decision requires a named human actor");
  }
  const id = typeof actor.userId === "string" ? actor.userId.trim() : "";
  if (id === "") {
    throw new ValidationError("an erasure decision requires a named human actor (actor id is empty)");
  }
  if ((NON_HUMAN_ACTOR_IDS as readonly string[]).includes(id.toLowerCase())) {
    throw new ValidationError(
      `"${id}" is not a human actor: deletion, suppression and retention are never decided autonomously`,
    );
  }
  if (typeof actor.label !== "string" || actor.label.trim() === "") {
    throw new ValidationError("an erasure decision requires a named human actor (actor label is empty)");
  }
}

export function hasApproverRole(actor: Actor): boolean {
  return actor.roles.includes("approver");
}

/** "High-risk erasure decisions are Approver-only." */
export function assertHighRiskIsApproverOnly(args: { actor: Actor; risk: DecisionRisk }): void {
  if (args.risk !== "high") return;
  if (!hasApproverRole(args.actor)) {
    throw new AppError(403, "forbidden", "High-risk: approver role required");
  }
}

/** "The requester must never be able to decide or approve an erasure outcome." */
export function assertRequesterIsNotTheDecider(args: {
  actor: Actor;
  requesterActorId: string | null | undefined;
}): void {
  const requester = typeof args.requesterActorId === "string" ? args.requesterActorId.trim() : "";
  if (requester === "") return;
  if (requester === args.actor.userId) {
    throw new AppError(
      403,
      "forbidden",
      "the requester cannot decide or approve an erasure outcome",
    );
  }
}

/** "The same actor must not both decide and approve a high-risk decision." */
export function assertDifferentActorDecidedAndApproved(args: {
  decidedBy: string;
  approvedBy: string | null | undefined;
  risk: DecisionRisk;
}): void {
  if (args.risk !== "high") return;
  const approvedBy = typeof args.approvedBy === "string" ? args.approvedBy.trim() : "";
  if (approvedBy === "") return;
  if (approvedBy === args.decidedBy) {
    throw new AppError(
      403,
      "forbidden",
      "a high-risk decision requires a different actor to approve it than the one who decided it",
    );
  }
}

/** "Retained under exception must be reviewed by an Approver before case approval." */
export function assertRetainedUnderExceptionReviewed(args: {
  outcome: string;
  reviewedBy: Actor | null | undefined;
}): void {
  if (args.outcome !== "retained_under_exception") return;
  if (!args.reviewedBy || !hasApproverRole(args.reviewedBy)) {
    throw new AppError(
      403,
      "forbidden",
      "Retained under exception requires review by an Approver before the case can be approved",
    );
  }
}

/** "Action required blocks approval." */
export function assertNoActionRequiredOutstanding(systems: readonly SystemOutcomeState[]): void {
  const blocking = systemsBlockingApproval(systems);
  if (blocking.length > 0) {
    throw new ValidationError(
      `${blocking.length} system(s) is/are in Action required. The case cannot enter approval until it is/they are resolved.`,
    );
  }
}

/** Roles permitted to decide an erasure outcome at all (the permission source has the final say). */
export const DECIDING_ROLES: readonly Role[] = ["owner", "workspace_admin", "request_handler", "approver"];
