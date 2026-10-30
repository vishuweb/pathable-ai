import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { canReview, isOwner, ownerKeyMissing, ownerKeyRequired } from "@/lib/owner";
import { drafts, reports } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Owner workspace · PathAble AI" };

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  if (ownerKeyMissing()) {
    return (
      <section aria-labelledby="owner-title">
        <h1 id="owner-title">Owner workspace</h1>
        <p className="empty-state">
          This deployment has no owner key yet, so the workspace is locked. Set <code>OWNER_KEY</code> in the
          project&apos;s environment variables and redeploy.
        </p>
      </section>
    );
  }

  if (!(await isOwner()) && (await canReview())) {
    const queued = await drafts.list();
    return (
      <section aria-labelledby="owner-title">
        <WorkspaceNav reviewerOnly />
        <h1 id="owner-title">Reviewer workspace</h1>
        <p className="intro">
          You are signed in as a reviewer. {queued.length} {queued.length === 1 ? "photo is" : "photos are"} waiting
          in the <Link href="/review">review queue</Link>. Follow the labelling guide your project owner gave you.
        </p>
        <form method="post" action="/api/owner" className="signout">
          <input type="hidden" name="action" value="signout" />
          <button type="submit" className="button-secondary">
            Sign out
          </button>
        </form>
      </section>
    );
  }

  if (!(await isOwner())) {
    return (
      <section aria-labelledby="owner-title" className="owner-page">
        <h1 id="owner-title">Owner workspace</h1>
        <p className="intro">
          The project owner and invited reviewers use this workspace to review photos as evaluation data and moderate
          shared reports. Anyone can <Link href="/report">report a barrier</Link> without signing in.
        </p>
        <form method="post" action="/api/owner">
          <label className="field">
            Owner or reviewer key
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
      </section>
    );
  }

  const [queued, saved] = await Promise.all([drafts.list(), reports.list()]);
  const tools = [
    {
      href: "/batch",
      title: "Batch analyze",
      text: "Analyze a folder of your own or web photos; each one joins the review queue.",
    },
    {
      href: "/review",
      title: "Review queue",
      text: `${queued.length} ${queued.length === 1 ? "photo is" : "photos are"} waiting. Your reviews become the evaluation labels.`,
    },
    {
      href: "/results",
      title: "Results",
      text: "Precision, recall and evidence quality measured from your reviews.",
    },
    {
      href: "/reports",
      title: "Moderate shared reports",
      text: `${saved.length} shared ${saved.length === 1 ? "report" : "reports"}. Open one to change its status or delete it.`,
    },
  ];

  return (
    <section aria-labelledby="owner-title">
      <WorkspaceNav />
      <h1 id="owner-title">Owner workspace</h1>
      <p className="intro">Evaluation and moderation tools. Visitors cannot see or use them.</p>
      <ul className="card-grid">
        {tools.map((tool) => (
          <li key={tool.href} className="card">
            <h2>
              <Link href={tool.href}>{tool.title}</Link>
            </h2>
            <p>{tool.text}</p>
          </li>
        ))}
      </ul>
      {ownerKeyRequired() && (
        <form method="post" action="/api/owner" className="signout">
          <input type="hidden" name="action" value="signout" />
          <button type="submit" className="button-secondary">
            Sign out
          </button>
        </form>
      )}
    </section>
  );
}
