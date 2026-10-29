import type { Metadata } from "next";
import { BatchAnalyzer } from "@/components/BatchAnalyzer";
import { OwnerOnly } from "@/components/OwnerOnly";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Batch analyze · PathAble AI" };

export default async function BatchPage() {
  if (!(await isOwner())) return <OwnerOnly title="Analyze many photos" />;
  return (
    <>
      <section className="intro">
        <h1>Analyze many photos</h1>
        <p>
          Select a set of photos and PathAble AI analyzes them in the background. Each one joins the review queue,
          where you check its findings without waiting. Your reviews become the measured results.
        </p>
      </section>
      <BatchAnalyzer />
    </>
  );
}
