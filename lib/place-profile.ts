// A place's accessibility profile: for each feature, every source of information (OpenStreetMap
// tags, visitors' observations), and which one currently stands. Shared by browser and server.
import { AREA_LABEL, FINDING_LABEL, observationStatus, type Observation } from "./observations";
import { isStale, placeAttributes, type PlaceAttribute } from "./place-attributes";
import type { Provenance } from "./provenance";

export interface FeatureSource {
  provenance: Provenance;
  value: string;
  /** When it was observed or last checked, if known (ISO date or date-time). */
  date?: string;
  detail?: string;
  observationId?: string;
  hasPhoto?: boolean;
}

export interface FeatureStatus extends Omit<PlaceAttribute, "state" | "value" | "detail" | "checked"> {
  /** Best source first: independently verified, then community reported, then OpenStreetMap. */
  sources: FeatureSource[];
  /** "unknown" when there is no source at all. */
  current: Provenance;
  outdated: boolean;
}

const RANK: Partial<Record<Provenance, number>> = { verified: 0, community: 1, osm: 2 };

/** Combines OpenStreetMap tags and observations into one status per feature. */
export function featureStatuses(
  tags: Record<string, string>,
  observations: Observation[],
  options: { lastEdited?: string; now?: Date } = {},
): FeatureStatus[] {
  return placeAttributes(tags).map(({ state, value, detail, checked, ...feature }) => {
    const sources: FeatureSource[] = observations
      .filter((o) => o.featureId === feature.id)
      .map((o) => ({
        provenance: observationStatus(o) === "verified" ? ("verified" as const) : ("community" as const),
        value: `${FINDING_LABEL[o.finding]} · ${AREA_LABEL[o.area]}`,
        date: o.observedOn,
        detail: o.note || undefined,
        observationId: o.id,
        hasPhoto: o.hasPhoto,
      }));
    if (state === "community" && value) {
      sources.push({ provenance: "osm", value, date: checked ?? options.lastEdited, detail });
    }
    sources.sort((a, b) => (RANK[a.provenance] ?? 9) - (RANK[b.provenance] ?? 9) || (b.date ?? "").localeCompare(a.date ?? ""));
    const best = sources[0];
    return {
      ...feature,
      sources,
      current: best?.provenance ?? "unknown",
      outdated: best ? isStale(best.date, options.now) : false,
    };
  });
}

/** The features that answer any of the given needs. */
export function featuresForNeeds(features: FeatureStatus[], needIds: string[]): FeatureStatus[] {
  return features.filter((f) => f.needIds.some((id) => needIds.includes(id)));
}
