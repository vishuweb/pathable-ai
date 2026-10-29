import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DraftReview } from "@/components/DraftReview";
import { OwnerOnly } from "@/components/OwnerOnly";
import { isOwner } from "@/lib/owner";
import { drafts } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review photo · PathAble AI" };

export default async function DraftReviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return <OwnerOnly title="Review queue" />;
  const { id } = await params;
  const queued = await drafts.list();
  const index = queued.findIndex((d) => d.id === id);
  if (index === -1) notFound();
  const next = queued.length > 1 ? queued[(index + 1) % queued.length] : undefined;

  return (
    <DraftReview
      key={id}
      draft={queued[index]}
      position={index + 1}
      total={queued.length}
      nextId={next?.id}
    />
  );
}
