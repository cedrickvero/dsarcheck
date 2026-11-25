/**
 * The sign-in landing page.
 *
 * The real product surface lives behind /app and is gated by a magic-link session. This is
 * the only public page: a centered card that requests a sign-in link. The docs/03 § G4 auth
 * screen shape (400px card, teal primary) applies.
 */
import { BRAND } from "@/domain/platform";
import { SignInForm } from "./_components/sign-in-form";

export default function HomePage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{BRAND}</h1>
        <p className="auth-sub">DSAR fulfillment and evidence workspace.</p>
        <SignInForm />
      </section>
    </main>
  );
}
