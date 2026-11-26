/**
 * The authenticated workspace shell.
 *
 * The whole app is gated here: requireAuth() runs server-side, and when it throws the
 * shell renders a sign-in prompt and NO case content whatsoever. There is no client-side
 * gate and no way for a child page to render data without passing through this.
 *
 * The middleware's cookie-presence check is a cheap pre-filter for unauthenticated
 * requests; it is NOT the authorization control. This is.
 */
import "../globals.css";
import { requireAuth } from "@/server/auth/require-auth";
import { now } from "@/server/time";
import { listNotifications } from "@/server/cases/notifications";
import { listReachableWorkspaces } from "@/server/cases/workspaces";
import { UnauthenticatedError, MfaRequiredError } from "@/server/http/errors";
import { StatePanel } from "./_components/state-panel";
import { NotificationBell } from "./_components/notification-bell";
import { WorkspaceSwitcher } from "./_components/workspace-switcher";
import { markAllRead, markRead, switchWorkspaceAction } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  owner: "Workspace admin",
  workspace_admin: "Workspace admin",
  approver: "Approver / DPO",
  request_handler: "Request handler",
  system_owner: "System owner",
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let actor = null;
  let mfaRequired = false;
  try {
    actor = await requireAuth();
  } catch (e) {
    if (e instanceof MfaRequiredError) mfaRequired = true;
    else if (!(e instanceof UnauthenticatedError)) throw e;
  }

  if (!actor) {
    return (
      <main className="shell" id="main">
        {mfaRequired ? (
          <StatePanel
            tone="signin"
            title="Two-factor verification required"
            body="Set up two-factor verification first: add this account to your authenticator app, then enter the 6-digit code it shows."
            action={{ href: "/mfa", label: "Set up two-factor verification" }}
          />
        ) : (
          <StatePanel
            tone="signin"
            title="Sign in required"
            body="This workspace needs a signed-in session. Request a sign-in link by email to continue."
            action={{ href: "/api/auth/magic-link", label: "Request a sign-in link" }}
          />
        )}
      </main>
    );
  }

  const feed = await listNotifications(actor, now());
  const wsContext = await listReachableWorkspaces(actor);
  const roleLabel = ROLE_LABELS[actor.roles[0] ?? ""] ?? "Workspace";

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="shell">
        <header className="shell-bar">
          <WorkspaceSwitcher context={wsContext} onSwitch={switchWorkspaceAction} />
          <nav aria-label="Workspace">
            <a href="/app">Dashboard</a>
            <a href="/app/cases">Cases</a>
            {actor.roles.includes("system_owner") ? <a href="/app/tasks">Tasks</a> : null}
          </nav>
          <NotificationBell
            notifications={feed.notifications}
            unread={feed.unread}
            label={`For ${actor.name ?? actor.label} · ${roleLabel}`}
            onMarkAll={markAllRead}
            onMarkRead={markRead}
          />
        </header>
        <main id="main">{children}</main>
      </div>
    </>
  );
}
