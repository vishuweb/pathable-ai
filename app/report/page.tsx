import type { Metadata } from "next";
import { AuditWorkspace } from "@/components/AuditWorkspace";

export const metadata: Metadata = { title: "Report a barrier · PathAble AI" };

export default function ReportBarrierPage() {
  return (
    <>
      <section className="intro">
        <h1>Report a barrier</h1>
        <p>
          Add a photo of a footpath, curb ramp, crossing or entrance. AI suggests possible barriers and outlines the
          evidence; you check every suggestion before anything is shared.
        </p>
      </section>
      <AuditWorkspace />
    </>
  );
}
