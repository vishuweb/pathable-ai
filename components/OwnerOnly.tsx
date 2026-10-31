import Link from "next/link";
import { sessionProblem } from "@/lib/owner";

/** Shown instead of an evaluation tool to visitors of a public deployment. */
export async function OwnerOnly({ title }: { title: string }) {
  const problem = await sessionProblem();
  return (
    <section aria-labelledby="owner-only-title">
      <h1 id="owner-only-title">{title}</h1>
      {(problem === "expired" || problem === "invalid") && (
        <p className="error" role="alert">
          {problem === "expired" ? "Your session has expired." : "Your session is not valid."} Please{" "}
          <Link href="/owner">sign in again</Link>.
        </p>
      )}
      <div className="empty-state">
        <p>
          This tool builds the project&apos;s measured results from the owner&apos;s own reviews, so it is kept for
          the project owner.
        </p>
        <p>
          You can still try the whole flow on one photo: <Link href="/report">report a barrier</Link>, or see the{" "}
          <Link href="/results">measured results</Link> and <Link href="/reports">saved reports</Link>.
        </p>
        <p className="muted">
          Project owner or invited reviewer? <Link href="/owner">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
