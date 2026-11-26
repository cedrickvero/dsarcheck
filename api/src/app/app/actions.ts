"use server";

/**
 * Shell-level server actions: notification read marks and the active-workspace switch.
 * Each re-authenticates because a server action is a public endpoint.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAuth, sessionCookieName } from "@/server/auth/require-auth";
import { now } from "@/server/time";
import { markAllNotificationsRead, markNotificationRead } from "@/server/cases/notifications";
import { switchWorkspace } from "@/server/cases/workspaces";
import { AppError } from "@/server/http/errors";

export async function markRead(notificationKey: string): Promise<void> {
  const actor = await requireAuth();
  await markNotificationRead(actor, notificationKey);
  revalidatePath("/app", "layout");
}

export async function markAllRead(): Promise<void> {
  const actor = await requireAuth();
  await markAllNotificationsRead(actor, now());
  revalidatePath("/app", "layout");
}

export interface SwitchWorkspaceResult {
  ok: boolean;
  message?: string;
}

/**
 * Switch the active workspace. Rotates the session (a fresh cookie), so the caller must
 * hard-navigate after success to pick up the new session. A switch to the CURRENT
 * workspace is a no-op. Refusal (unknown/foreign workspace) surfaces as a generic error.
 */
export async function switchWorkspaceAction(input: { workspaceId: string }): Promise<SwitchWorkspaceResult> {
  try {
    const actor = await requireAuth();
    if (!input.workspaceId) return { ok: false, message: "No workspace selected." };
    if (input.workspaceId === actor.workspaceId) return { ok: true };

    const { token } = await switchWorkspace(actor, input.workspaceId);

    const store = await cookies();
    store.set(sessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 3600,
    });

    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
