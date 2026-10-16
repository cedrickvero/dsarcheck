/**
 * The five UI states as one component, so no screen forgets one.
 *
 * Every state is conveyed by TEXT plus a shape marker, never by colour alone
 * (AGENTS.md non-negotiable). Remove all CSS and each state still says what it is.
 */
export type PanelTone = "empty" | "error" | "denied" | "missing" | "loading" | "signin";

const MARKERS: Record<PanelTone, string> = {
  empty: "\u25CB",
  error: "!",
  denied: "\u2298",
  missing: "\u2014",
  loading: "\u22EF",
  signin: "\u2192",
};

export function StatePanel(props: {
  tone: PanelTone;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="state-panel" data-state={props.tone} role="status" aria-live="polite">
      <p className="state-marker" aria-hidden="true">{MARKERS[props.tone]}</p>
      <h2>{props.title}</h2>
      <p>{props.body}</p>
      {props.action ? (
        <a className="button" href={props.action.href}>{props.action.label}</a>
      ) : null}
    </section>
  );
}
