import { SkeletonList } from "@/components/ui/Skeleton";

export default function Loading() {
  return <SkeletonList label="Loading campus places…" rows={6} />;
}
