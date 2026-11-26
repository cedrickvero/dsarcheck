"use client";

/**
 * The active-workspace switcher (docs/03 § A.2). Agency orgs only: a button that opens a
 * menu of the actor's reachable client workspaces (home + memberships) with the current one
 * checked. Direct orgs get the static "Workspace · name" block. Switching rotates the
 * session server-side, so this hard-navigates on success to pick up the new cookie.
 *
 * The context/action arrive as props (the server page resolves them); the shapes are
 * declared locally — a client component may not import types from @/server.
 */
import { useEffect, useRef, useState } from "react";

interface SwitchWorkspace {
  workspaceId: string;
  name: string;
  role: string;
  isCurrent: boolean;
}

interface SwitchContext {
  orgId: string;
  orgName: string;
  orgKind: "agency" | "direct";
  currentWorkspaceId: string;
  workspaces: SwitchWorkspace[];
}

type SwitchAction = (input: { workspaceId: string }) => Promise<{ ok: boolean; message?: string }>;

function initial(name: string): string {
  const t = name.trim();
  return (t.charAt(0) || "?").toUpperCase();
}

export function WorkspaceSwitcher(props: { context: SwitchContext; onSwitch: SwitchAction }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const current = props.context.workspaces.find((w) => w.isCurrent) ?? null;
  const { orgKind } = props.context;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const choose = async (workspaceId: string) => {
    if (busy || workspaceId === props.context.currentWorkspaceId) return;
    setBusy(true);
    setError(null);
    const result = await props.onSwitch({ workspaceId });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not switch workspace.");
      return;
    }
    setOpen(false);
    window.location.assign("/app");
  };

  if (orgKind !== "agency") {
    return (
      <div className="ws-switcher ws-switcher--static">
        <span className="ws-switcher-caption">Workspace</span>
        <span className="ws-switcher-current">{current?.name ?? ""}</span>
      </div>
    );
  }

  const count = props.context.workspaces.length;

  return (
    <div className="ws-switcher" ref={ref}>
      <button type="button" className="ws-switcher-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ws-switcher-caption">Client workspace</span>
        <span className="ws-switcher-current">{current?.name ?? ""}</span>
        <span className="ws-switcher-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open ? (
        <div className="ws-switcher-menu" role="menu">
          <div className="ws-switcher-header">
            {props.context.orgName} · {count} client{count === 1 ? "" : "s"}
          </div>
          {props.context.workspaces.map((w) => (
            <button
              key={w.workspaceId}
              type="button"
              role="menuitem"
              className="ws-switcher-item"
              aria-current={w.isCurrent ? "true" : undefined}
              onClick={() => choose(w.workspaceId)}
              disabled={busy}
            >
              <span className="ws-switcher-tile" aria-hidden="true">
                {initial(w.name)}
              </span>
              <span className="ws-switcher-name">{w.name}</span>
              {w.isCurrent ? (
                <span className="ws-switcher-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
