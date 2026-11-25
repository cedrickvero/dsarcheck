"use server";

/**
 * Notification read marks. The list itself is derived server-side; these only persist the
 * read/unread state. Both re-authenticate because a server action is a public endpoint.
 */
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/server/auth/require-auth";
import { now } from "@/server/time";
import { markAllNotificationsRead, markNotificationRead } from "@/server/cases/notifications";

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
