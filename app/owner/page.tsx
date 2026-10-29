import type { Metadata } from "next";
import Link from "next/link";
import { isOwner, ownerKeyMissing, ownerKeyRequired } from "@/lib/owner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner sign-in · PathAble AI" };

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const signedIn = await isOwner();

  return (
    <section aria-labelledby="owner-title" className="owner-page">
      <h1 id="owner-title">Owner sign-in</h1>
      {ownerKeyMissing() ? (
        <p className="empty-state">
          This deployment has no owner key yet, so the evaluation tools are locked. Set <code>OWNER_KEY</code> in the
          project&apos;s environment variables and redeploy.
        </p>
      ) : !ownerKeyRequired() ? (
        <p className="empty-state">
          This copy of PathAble AI has no owner key, so every tool is open. <Link href="/batch">Batch analyze</Link>
        </p>
      ) : signedIn ? (
        <form method="post" action="/api/owner" className="empty-state">
          <p>
            You are signed in as the owner. <Link href="/review">Go to the review queue</Link>
          </p>
          <input type="hidden" name="action" value="signout" />
          <button type="submit" className="button-secondary">
            Sign out
          </button>
        </form>
      ) : (
        <form method="post" action="/api/owner">
          <p className="intro">
            Batch analysis and the review queue build this project&apos;s measured results, so they are kept for the
            project owner. Anyone can analyze a photo and save a report on the <Link href="/">New report</Link> page.
          </p>
          <label className="field">
            Owner key
            <input
              type="password"
              name="key"
              required
              autoComplete="current-password"
              aria-describedby={error ? "owner-error" : undefined}
              aria-invalid={error ? true : undefined}
            />
          </label>
          {error && (
            <p id="owner-error" className="field-error" role="alert">
              That key is not correct.
            </p>
          )}
          <p>
            <button type="submit" className="button-primary">
              Sign in
            </button>
          </p>
        </form>
      )}
    </section>
  );
}
