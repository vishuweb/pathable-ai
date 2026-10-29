import Link from "next/link";

/** Shown instead of an evaluation tool to visitors of a public deployment. */
export function OwnerOnly({ title }: { title: string }) {
  return (
    <section aria-labelledby="owner-only-title">
      <h1 id="owner-only-title">{title}</h1>
      <div className="empty-state">
        <p>
          This tool builds the project&apos;s measured results from the owner&apos;s own reviews, so it is kept for
          the project owner.
        </p>
        <p>
          You can still try the whole flow on one photo: <Link href="/">start a new report</Link>, or see the{" "}
          <Link href="/results">measured results</Link> and <Link href="/reports">saved reports</Link>.
        </p>
        <p className="muted">
          Project owner? <Link href="/owner">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
