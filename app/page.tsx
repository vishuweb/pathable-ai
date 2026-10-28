import { AuditWorkspace } from "@/components/AuditWorkspace";

export default function HomePage() {
  return (
    <>
      <section className="intro">
        <h1>Document accessibility barriers with evidence</h1>
        <p>
          Upload a photo of a sidewalk, curb ramp, crossing, or entrance. PathAble AI identifies
          potential barriers, highlights the visual evidence, and prepares a report for a human to
          verify.
        </p>
      </section>
      <AuditWorkspace />
    </>
  );
}
