import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { DEMO_SCENARIOS } from "@/lib/demo/fixtures";
import { NEED_GROUP_INFO } from "@/lib/needs";

export const metadata: Metadata = { title: "Demo · PathAble AI" };

export default function DemoPage() {
  return (
    <section aria-labelledby="demo-title">
      <h1 id="demo-title">See how PathAble works</h1>
      <p className="intro">
        Four short journeys with fictional places. Very little of the real campus has been recorded yet, so these show what the product does once information exists. Nothing you do here is sent or saved, and none of it counts towards real reports, coverage or AI results.
      </p>
      <ul className="info-grid">
        {DEMO_SCENARIOS.map((s) => (
          <li key={s.id} className="info-card">
            <span className="info-icon">
              <Icon name={s.need} />
            </span>
            <h2 className="demo-card-title">
              <Link href={`/demo/${s.id}`}>{s.title}</Link>
            </h2>
            <p className="muted">{NEED_GROUP_INFO[s.need].label}</p>
            <p>{s.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
