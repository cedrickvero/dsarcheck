/**
 * The sign-in landing page.
 *
 * The real product surface lives behind /app and is gated by a magic-link session. This is
 * the only public page: a centered card that requests a sign-in link. The docs/03 § G4 auth
 * screen shape (400px card, teal primary) applies.
 *
 * `?sent=1` is set by the no-JavaScript form flow (the route 303s here after sending); the
 * JavaScript path shows the same message inline instead.
 */
import { BRAND } from "@/domain/platform";
import { SignInForm } from "./_components/sign-in-form";

export default async function HomePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.searchParams;
  const sent = params.sent === "1";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{BRAND}</h1>
        <p className="auth-sub">DSAR fulfillment and evidence workspace.</p>
        <SignInForm initiallySent={sent} />
      </section>
    </main>
  );
}
