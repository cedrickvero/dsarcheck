"use client";

/**
 * The notification bell and its panel.
 *
 * The list is derived and passed in; this only owns the open/close interaction. Escape
 * closes the panel and returns focus to the bell, the count is announced, and every entry
 * is a real link so middle-click and Enter work without extra wiring.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { bellAriaLabel, type DerivedNotification } from "@/domain/notifications";

export interface NotificationBellProps {
  notifications: DerivedNotification[];
  unread: number;
  /** Displays below the badge, e.g. "For Priya Shah · Request handler". */
  label: string;
  /** Actions arrive as props (the layout passes the server actions; tests pass stubs). */
  onMarkAll: () => Promise<void>;
  onMarkRead: (notificationKey: string) => Promise<void>;
  /** Test hook only: render the panel open in static markup. Never set in production. */
  defaultOpen?: boolean;
}

export function NotificationBell(props: NotificationBellProps) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const markAll = () => {
    startTransition(async () => {
      await props.onMarkAll();
      // The layout re-renders with the fresh (now all-read) feed.
    });
  };

  // A real <a href> so middle-click and Enter work natively; the mark-read runs alongside
  // navigation (fire-and-forget) and the anchor is not prevented from navigating.
  const openNotification = (id: string) => {
    startTransition(async () => {
      await props.onMarkRead(id);
    });
  };

  return (
    <div className="notification-bell">
      <button
        type="button"
        ref={triggerRef}
        className="bell-button"
        aria-label={bellAriaLabel(props.unread)}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{"\u{1F514}"}</span>
        {props.unread > 0 ? (
          <span className="badge">{props.unread > 9 ? "9+" : props.unread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-panel" role="region" aria-label="Notifications" tabIndex={-1} ref={panelRef}>
          <div className="notif-head">
            <span>{props.label}</span>
            <button type="button" className="button button-ghost" onClick={markAll} disabled={pending || props.unread === 0}>
              Mark all as read
            </button>
          </div>

          {props.notifications.length === 0 ? (
            <p className="notif-empty">Nothing needs you right now.</p>
          ) : (
            <ul className="notif-list">
              {props.notifications.map((n) => (
                <li key={n.id} className={n.unread ? "unread" : ""}>
                  <a
                    className="notif-item"
                    href={`/app/cases/${n.caseId}`}
                    onClick={() => openNotification(n.id)}
                  >
                    <span className="notif-title">{n.title}</span>
                    <span className="notif-sub">{n.sub}</span>
                    <span className="notif-meta">{n.meta}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
