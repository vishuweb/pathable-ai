import type { Metadata } from "next";
import { OwnerOnly } from "@/components/OwnerOnly";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { aiExhausted } from "@/lib/ai-guard";
import { isOwner } from "@/lib/owner";
import { aiUsage } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI usage · PathAble AI" };

export default async function AiUsagePage() {
  if (!(await isOwner())) return <OwnerOnly title="AI usage" />;
  const days = (await aiUsage.list()).sort((a, b) => b.day.localeCompare(a.day));
  const rows = days.flatMap((d) => Object.entries(d.models).map(([model, usage]) => ({ day: d.day, model, ...usage })));

  return (
    <section aria-labelledby="usage-title">
      <WorkspaceNav />
      <h1 id="usage-title">AI usage</h1>
      <p className="intro">
        Calls this site made to the Meta models. This is a close estimate for keeping an eye on things. Your account&apos;s Usage and Billing page is what counts, and it is the only place that shows your credit balance.
      </p>
      <ul className="overview-facts">
        <li>{process.env.AI_PAUSED === "1" ? "AI is paused by the AI_PAUSED setting." : "AI is not paused by the AI_PAUSED setting."}</li>
        <li>{aiExhausted() ? "This server was told credits or billing are the problem, so it has stopped AI calls for up to an hour." : "No credit or billing problem has been reported to this server recently."}</li>
        <li>A repeat of the same photo reuses the earlier result and is not counted, because no call is made.</li>
        <li>If credits run out, AI calls stop with a clear message. Nothing switches to paid usage, and browsing and observations keep working.</li>
      </ul>
      {rows.length === 0 ? (
        <p className="empty-state">No AI calls have been recorded yet.</p>
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="AI calls by day and model">
          <table className="metrics-table">
            <caption>AI calls by day and model</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Model</th>
                <th scope="col">Calls</th>
                <th scope="col">Failed</th>
                <th scope="col">Input tokens</th>
                <th scope="col">Output tokens</th>
                <th scope="col">Average seconds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.day}${r.model}`}>
                  <th scope="row">{r.day}</th>
                  <td>{r.model}</td>
                  <td>{r.calls}</td>
                  <td>{r.failures}</td>
                  <td>{r.promptTokens || "not reported"}</td>
                  <td>{r.completionTokens || "not reported"}</td>
                  <td>{r.calls ? (r.milliseconds / r.calls / 1000).toFixed(1) : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
