import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoScenario } from "@/components/demo/DemoScenario";
import { DEMO_SCENARIOS, findScenario } from "@/lib/demo/fixtures";

type Params = { params: Promise<{ scenario: string }> };

export function generateStaticParams() {
  return DEMO_SCENARIOS.map((s) => ({ scenario: s.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: `Demo: ${findScenario((await params).scenario)?.title ?? "not found"} · PathAble AI` };
}

export default async function DemoScenarioPage({ params }: Params) {
  const scenario = findScenario((await params).scenario);
  if (!scenario) notFound();
  return <DemoScenario scenario={scenario} />;
}
