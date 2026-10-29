import type { Metadata } from "next";
import { BatchAnalyzer } from "@/components/BatchAnalyzer";

export const metadata: Metadata = { title: "Batch analyze · PathAble AI" };

export default function BatchPage() {
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
