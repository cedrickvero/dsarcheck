/** An honest placeholder for a cockpit tab that is a later slice, not a silent omission. */
export function TabStub({ title, body }: { title: string; body: string }) {
  return (
    <section className="card" aria-labelledby="stub-title">
      <h2 id="stub-title">{title}</h2>
      <p className="muted">{body}</p>
    </section>
  );
}
