/**
 * Placeholder home so the app boots.
 *
 * Real screens come from the design handoff (docs/03-screens.md) in later
 * phases - this is intentionally not a product surface.
 */
export default function HomePage() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Privacyspace</h1>
      <p>DSAR fulfillment and evidence workspace.</p>
      <p>
        Health: <a href="/health">/health</a> - <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
