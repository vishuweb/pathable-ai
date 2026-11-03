import type { Metadata } from "next";
import Link from "next/link";
import { OwnerOnly } from "@/components/OwnerOnly";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { aiExhausted } from "@/lib/ai-guard";
import { isApiKeyConfigured } from "@/lib/meta";
import { maxPending } from "@/lib/moderation-store";
import { accessConfig, isOwner } from "@/lib/owner";
import { STORAGE } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings and privacy · PathAble AI" };

/** What this deployment is set to. Says whether each secret exists; never shows one. Settings are changed on Vercel, not here. */
export default async function SettingsPage() {
  if (!(await isOwner())) return <OwnerOnly title="Settings and privacy" />;
  const access = accessConfig();
  const rows: [string, string][] = [
    ["Owner key", access.ownerKey ? "Set" : "Not set"],
    ["Reviewer key", access.reviewerKey ? "Set" : "Not set. Independent checks need a reviewer, so surveys you record cannot become independently verified."],
    ["Meta API key", isApiKeyConfigured() ? "Set" : "Not set, so AI features will say they are unavailable."],
    ["AI calls", process.env.AI_PAUSED === "1" ? "Paused by AI_PAUSED" : aiExhausted() ? "Stopped for up to an hour after a credit or billing error" : "On, within the limits below"],
    ["AI calls per visitor per hour", process.env.ANALYZE_LIMIT_PER_HOUR || "30 (default)"],
    ["AI calls per day, everyone", process.env.AI_DAILY_LIMIT || "300 (default)"],
    ["Public submissions per visitor per hour", process.env.SUBMISSION_LIMIT_PER_HOUR || "10 (default)"],
    ["Public submissions per day", process.env.SUBMISSIONS_PER_DAY || "200 (default)"],
    ["Most submissions waiting for approval", String(maxPending())],
    ["Storage", STORAGE === "blob" ? "Vercel Blob" : "Local disk"],
  ];
  return (
    <section aria-labelledby="settings-title">
      <WorkspaceNav />
      <h1 id="settings-title">Settings and privacy</h1>
      <p className="intro">What this deployment is set to. Values are read only here: change them in your hosting settings. Secrets are never shown.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Current settings">
        <table className="metrics-table">
          <caption>Current settings</caption>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Privacy</h2>
      <ul className="overview-facts">
        <li>
          What visitors are told: <Link href="/privacy">the privacy page</Link>.
        </li>
        <li>Photos are re-encoded on the server, so location and camera details are removed before storage or AI.</li>
        <li>Visitors&apos; needs stay in their own browser and are never sent here.</li>
        <li>
          Your data: <Link href="/owner/coverage">import and export</Link>.
        </li>
      </ul>
    </section>
  );
}
