import type { Metadata } from "next";
import Link from "next/link";
import { NeedsPreferences } from "@/components/NeedsPreferences";

export const metadata: Metadata = { title: "My needs · PathAble AI" };

export default function NeedsPage() {
  return (
    <section aria-labelledby="needs-title" className="needs-page">
      <h1 id="needs-title">My needs</h1>
      <p className="intro">
        Choose what matters to you, in any combination, and every place page shows your details first. It helps you spend less time looking for what you need. You never need to name a condition, and you can skip this and <Link href="/places">browse everything</Link>.
      </p>
      <ul className="info-grid needs-why">
        <li className="info-card">
          <h2 className="demo-card-title">Only on this device</h2>
          <p>Your choices stay in this browser. They are never sent to PathAble AI or anyone else.</p>
        </li>
        <li className="info-card">
          <h2 className="demo-card-title">Nothing is hidden</h2>
          <p>Choices change the order, not what you can see. Everything else stays on the page.</p>
        </li>
        <li className="info-card">
          <h2 className="demo-card-title">No verdicts</h2>
          <p>They do not decide whether a place suits you. Where information is missing, it is shown as unknown.</p>
        </li>
      </ul>
      <NeedsPreferences />
      <p>
        Next: <Link href="/reports">see reports relevant to your needs</Link> or{" "}
        <Link href="/report">report a barrier</Link>.
      </p>
    </section>
  );
}
