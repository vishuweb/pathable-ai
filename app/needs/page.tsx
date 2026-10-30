import type { Metadata } from "next";
import Link from "next/link";
import { NeedsPreferences } from "@/components/NeedsPreferences";

export const metadata: Metadata = { title: "My needs · PathAble AI" };

export default function NeedsPage() {
  return (
    <section aria-labelledby="needs-title" className="needs-page">
      <h1 id="needs-title">My needs</h1>
      <p className="intro">
        Choose what matters to you, in any combination. PathAble AI uses your choices to show the reports most
        relevant to you first. You never need to name a condition.
      </p>
      <p className="callout">
        Your choices are saved only in this browser. They are never sent to PathAble AI or anyone else, and you can
        change or remove them at any time. They do not decide whether a place is suitable for you: where information
        is missing, it is shown as unknown.
      </p>
      <NeedsPreferences />
      <p>
        Next: <Link href="/reports">see reports relevant to your needs</Link> or{" "}
        <Link href="/report">report a barrier</Link>.
      </p>
    </section>
  );
}
