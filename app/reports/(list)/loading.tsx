import { SkeletonList } from "@/components/ui/Skeleton";

export default function Loading() {
  return <SkeletonList label="Loading community reports…" rows={4} />;
}
