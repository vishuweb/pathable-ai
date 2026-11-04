import type { Metadata } from "next";
import Link from "next/link";
import { NeedsPreferences } from "@/components/NeedsPreferences";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "My needs · PathAble AI" };

export default function NeedsPage() {
  return (
    <section aria-labelledby="needs-title" className="needs-page">
      <h1 id="needs-title">My needs</h1>
      <p className="intro">
        Choose what matters to you and every place page shows your details first. You never need to name a condition, and you can skip this and <Link href="/places">browse everything</Link>.
      </p>
      <ul className="needs-why">
        <li>
          <Icon name="check" size={18} /> Saved only in this browser. Never sent to PathAble AI or anyone else.
        </li>
        <li>
          <Icon name="check" size={18} /> Choices change the order of what you see, never what you can see.
        </li>
        <li>
          <Icon name="check" size={18} /> They do not decide whether a place suits you. Missing information stays marked as unknown.
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
