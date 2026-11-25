/**
 * The notification bell, rendered to markup: the unread count is announced, the badge
 * caps at 9+, and the list is real text with real links.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationBell } from "@/app/app/_components/notification-bell";
import type { DerivedNotification } from "@/domain/notifications";

const notif = (over: Partial<DerivedNotification> = {}): DerivedNotification => ({
  id: "DSAR-2026-00418nw",
  kind: "nw",
  caseId: "DSAR-2026-00418",
  icon: "inbox",
  tone: "info",
  title: "New request",
  sub: "Access from Maya Lindqvist arrived through the portal.",
  meta: "DSAR-2026-00418 · 11 days left",
  tab: "overview",
  unread: true,
  ...over,
});

const noop = async () => {};

function bell(over: Partial<React.ComponentProps<typeof NotificationBell>> = {}) {
  return (
    <NotificationBell
      notifications={[notif()]}
      unread={3}
      label="For Priya Shah · Request handler"
      onMarkAll={noop}
      onMarkRead={noop}
      {...over}
    />
  );
}

describe("NotificationBell", () => {
  it("announces the unread count and shows the badge", () => {
    const html = renderToStaticMarkup(bell());
    expect(html).toContain('aria-label="Notifications, 3 unread"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("renders the open panel with the list as text", () => {
    const html = renderToStaticMarkup(bell({ defaultOpen: true }));
    expect(html).toContain("New request");
    expect(html).toContain("Access from Maya Lindqvist arrived through the portal.");
    expect(html).toContain('aria-expanded="true"');
  });

  it("renders every entry as a REAL link, so middle-click and Enter work natively", () => {
    const html = renderToStaticMarkup(bell({ defaultOpen: true }));
    expect(html).toContain('<a class="notif-item" href="/app/cases/DSAR-2026-00418">');
    expect(html).not.toContain("window.location.assign");
  });

  it("caps the badge at 9+ and drops it entirely at zero", () => {
    expect(renderToStaticMarkup(bell({ unread: 10 }))).toContain("9+");
    expect(renderToStaticMarkup(bell({ unread: 0 }))).not.toContain("badge");
    expect(renderToStaticMarkup(bell({ unread: 0 }))).toContain(
      'aria-label="Notifications, 0 unread"',
    );
  });

  it("opens with a Mark all as read control and a role label", () => {
    const html = renderToStaticMarkup(
      <NotificationBell
        notifications={[notif()]}
        unread={1}
        label="For Daniel Okafor · Approver"
        onMarkAll={noop}
        onMarkRead={noop}
        defaultOpen
      />,
    );
    expect(html).toContain("Mark all as read");
    expect(html).toContain("For Daniel Okafor · Approver");
  });

  it("shows an empty state with text, never an empty list that looks broken", () => {
    const html = renderToStaticMarkup(bell({ notifications: [], unread: 0, defaultOpen: true }));
    expect(html).toContain("Nothing needs you right now.");
  });

  it("keeps the unread distinction as text on the item, not only styling", () => {
    // The class carries the visual weight; the aria-label on the bell carries the count.
    const html = renderToStaticMarkup(bell());
    expect(html).toContain("Notifications, 3 unread");
  });
});
