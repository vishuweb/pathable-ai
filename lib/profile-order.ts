// How a place profile is ordered around a visitor's own needs. Ordering only: nothing here hides a
// detail, it just decides what comes first. Shared by browser and server.
import { NEEDS, NEED_GROUPS, type NeedGroup } from "./needs";
import type { Barrier, FeatureIntel } from "./place-intelligence";

/** Whether a feature answers any of the chosen needs. */
export const isRelevant = (feature: Pick<FeatureIntel, "needIds">, needIds: string[]) => feature.needIds.some((id) => needIds.includes(id));

/** The groups the chosen needs belong to. */
export function groupsOfNeeds(needIds: string[]): NeedGroup[] {
  const groups = new Set(NEEDS.filter((n) => needIds.includes(n.id)).map((n) => n.group));
  return NEED_GROUPS.filter((g) => groups.has(g));
}

/** Smaller comes first: what most needs a visitor's attention, then the strongest record, then what is unknown. */
function priority(feature: FeatureIntel): number {
  if (feature.conflict) return 0;
  if (feature.barrierIds.length) return 1;
  switch (feature.current) {
    case "verified":
      return 2;
    case "owner_recorded":
      return 3;
    case "community":
    case "reporter_confirmed":
      return 4;
    case "osm":
      return 5;
    default:
      return 6;
  }
}

/** Splits features into those that answer the chosen needs and the rest, each in order of attention. Together they are every feature. */
export function orderFeatures(features: FeatureIntel[], needIds: string[]): { mine: FeatureIntel[]; rest: FeatureIntel[] } {
  const byPriority = (a: FeatureIntel, b: FeatureIntel) => priority(a) - priority(b);
  const mine = needIds.length ? features.filter((f) => isRelevant(f, needIds)).sort(byPriority) : [];
  const rest = features.filter((f) => !mine.includes(f)).sort(needIds.length ? byPriority : () => 0);
  return { mine, rest };
}

/** The groups in the order to show them: those the visitor chose first. */
export function orderGroups(needIds: string[]): NeedGroup[] {
  const chosen = groupsOfNeeds(needIds);
  return [...chosen, ...NEED_GROUPS.filter((g) => !chosen.includes(g))];
}

/** Barriers that may affect the chosen needs first, otherwise as given. Every barrier is kept. */
export function orderBarriers(barriers: Barrier[], needIds: string[]): { barrier: Barrier; affectsYou: boolean }[] {
  const groups = groupsOfNeeds(needIds);
  const marked = barriers.map((barrier) => ({ barrier, affectsYou: barrier.needGroups.some((g) => groups.includes(g)) }));
  return needIds.length ? [...marked.filter((b) => b.affectsYou), ...marked.filter((b) => !b.affectsYou)] : marked;
}
