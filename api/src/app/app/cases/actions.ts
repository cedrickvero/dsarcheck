"use server";

/**
 * Server actions for the case list.
 *
 * Both re-authenticate: a server action is a public endpoint, and relying on the page
 * having authenticated the caller would make the action reachable without a session.
 * The authorization matrix, validation, transaction and audit rows all live in
 * `src/server/cases/bulk.ts` - the same code the tests drive directly.
 */
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/require-auth";
import { now } from "@/server/time";
import { bulkAssignOwner, exportCasesCsv } from "@/server/cases/bulk";
import { updateSystemStatus } from "@/server/cases/checklist";
import { AppError } from "@/server/http/errors";

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  message?: string;
}

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

export async function assignOwner(input: {
  caseNumbers: string[];
  ownerId: string;
  reason: string;
}): Promise<ActionResult<{ updated: number; ownerName: string }>> {
  try {
    const actor = await requireAuth();
    const result = await bulkAssignOwner(actor, input);
    revalidatePath("/app/cases");
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function exportCases(input: {
  caseNumbers: string[];
  reason: string;
}): Promise<ActionResult<{ csv: string; filename: string; count: number }>> {
  try {
    const actor = await requireAuth();
    const result = await exportCasesCsv(actor, { ...input, now: now() });
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function setSystemStatus(input: {
  caseId: string;
  caseNumber: string;
  sourceKey: string;
  status: string;
  reason: string;
  exceptionCategory?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireAuth();
    await updateSystemStatus(actor, input.caseId, {
      sourceKey: input.sourceKey,
      status: input.status,
      reason: input.reason,
      exceptionCategory: input.exceptionCategory,
    });
    revalidatePath(`/app/cases/${input.caseNumber}`);
    return { ok: true, data: { status: input.status } };
  } catch (error) {
    return failure(error);
  }
}
