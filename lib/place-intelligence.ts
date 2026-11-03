// One connected view of a campus place: what is recorded about each feature, which barriers have
// been reported there, and where the evidence disagrees. Pure and deterministic, so it is tested
// directly and shared by browser and server.
//
// Rules this module keeps:
//  - Only approved items count, and only reports tied to this place by its OpenStreetMap id. A report
//    with no confirmed place is never guessed onto one.
//  - Evidence is scoped. A barrier report touches the features its category can bear on (see
//    lib/evidence-map.ts) and never sets the state of a whole feature.
//  - Provenance is never upgraded by approval. "Independently verified" needs a recorded reason from
//    someone other than the submitter. AI suggestions and reporter confirmation stay what they are.
//  - Nothing is overwritten. Disagreement is reported as a conflict, newer evidence supersedes older
//    only when someone says so ("it has changed"), and superseded claims stay in the history.
//  - Age only ever raises a warning. It never turns a record into "unknown" or "accessible".
import { CATEGORY_INFO } from "./categories";
import { CATEGORY_FEATURES, FINDING_POLARITY, POLARITY_LABEL, scopeNote, type Polarity } from "./evidence-map";
import { isPublic } from "./moderation";
import { NEED_GROUPS, type NeedGroup } from "./needs";
import {
  AREA_LABEL,
  FINDING_LABEL,
  observationStatus,
  type Coordinates,
  type Observation,
  type ObservationFinding,
  type PlaceArea,
  type ResponseKind,
} from "./observations";
import { distanceMeters, type PlaceRef } from "./place";
import { isStale, placeAttributes } from "./place-attributes";
import type { Provenance } from "./provenance";
import type { SavedReport } from "./report";
import type { PublicAnswer, PublicSurvey } from "./survey";
import { SUBLOCATION_AREA } from "./survey-taxonomy";
import { STATUS_INFO, currentStatus, statusHistory, type ReportStatus, type StatusEvent } from "./report-status";
import type { IssueCategory } from "./types";

/** Observations of the same thing within this many days are one claim, however each person words it. */
export const DUPLICATE_WINDOW_DAYS = 14;
/** An open barrier not looked at for this long is flagged for a recheck. A warning only; nothing changes. */
export const BARRIER_RECHECK_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;
const RANK: Partial<Record<Provenance, number>> = { verified: 0, owner_recorded: 1, community: 2, reporter_confirmed: 2, osm: 3, ai: 4 };

export interface Contribution {
  id: string;
  featureId: string;
  featureLabel: string;
  finding: string;
  area: PlaceArea;
  areaLabel: string;
  observedOn: string;
  recordedAt: string;
  note: string;
  hasPhoto: boolean;
  provenance: "community" | "verified";
  verifiedNote?: string;
  /** What this one does to an earlier observation, if it answers one. */
  responseKind?: ResponseKind;
  respondsTo?: string;
  /** Counted together with this earlier observation of the same thing. */
  mergedInto?: string;
  superseded: boolean;
  inConflict: boolean;
  observationCoordinates?: Coordinates;
}

export interface Claim {
  /** The observation that stands for the claim, "osm", or "<survey id>:<attribute id>". */
  id: string;
  source: "osm" | "observation" | "survey";
  provenance: "osm" | "community" | "verified" | "owner_recorded" | "reporter_confirmed" | "ai";
  /** Where it applies: claims about different spots do not contradict each other. Defaults to the area. */
  spot?: string;
  /** Survey photos that show this attribute. */
  photoUrls?: string[];
  polarity?: Polarity;
  /** The observation's own finding, for answering it. */
  finding?: ObservationFinding;
  value: string;
  area?: PlaceArea;
  scope: string;
  /** The latest day anyone saw it, or the date OpenStreetMap contributors last checked it. */
  observedOn?: string;
  firstObservedOn?: string;
  recordedAt?: string;
  detail?: string;
  /** How many separate observations back it: duplicates and confirmations. Evidence-only additions are not counted. */
  count: number;
  contributionIds: string[];
  hasPhoto: boolean;
  verifiedNote?: string;
  /** Why a recorded check does not count as independent, when it does not. */
  verificationCaveat?: string;
  outdated: boolean;
  inConflict: boolean;
  supersededBy?: string;
}

export interface Conflict {
  areas: (PlaceArea | "any")[];
  claimIds: string[];
  summary: string;
  hasVerified: boolean;
}

export interface FeatureIntel {
  id: string;
  label: string;
  group: NeedGroup;
  needIds: string[];
  /** The provenance of the best current claim; "unknown" with none. Never "accessible". */
  current: Provenance;
  claims: Claim[];
  /** Earlier claims that someone has since updated; kept for the history. */
  history: Claim[];
  conflict?: Conflict;
  /** Open barrier reports that may bear on this feature. They never set its state. */
  barrierIds: string[];
  observedOn?: string;
  outdated: boolean;
}

export interface BarrierItem {
  title: string;
  category: IssueCategory;
  categoryLabel: string;
  description: string;
  /** "reporter_confirmed" when the reporter confirmed it, "ai" if nobody has reviewed an AI suggestion. */
  provenance: "reporter_confirmed" | "ai";
}

export interface Barrier {
  reportId: string;
  items: BarrierItem[];
  area?: PlaceArea;
  areaLabel?: string;
  scope: string;
  needGroups: NeedGroup[];
  affectedFeatureIds: string[];
  reportedAt: string;
  observedOn?: string;
  status: ReportStatus;
  statusLabel: string;
  statusNote: string;
  statusAt: string;
  provenance: "ai" | "reporter_confirmed" | "verified" | "resolved";
  verifiedNote?: string;
  /** Why a "verified" status does not count as independent, when it does not. */
  verificationCaveat?: string;
  open: boolean;
  resolution?: { at: string; note: string };
  closedAs?: { duplicateOf?: string; note: string };
  recheckDue: boolean;
  history: StatusEvent[];
  placeCoordinates?: { latitude: number; longitude: number };
  observationCoordinates?: Coordinates;
}

export interface PlaceIntelligence {
  features: FeatureIntel[];
  /** Open barriers, newest first. */
  barriers: Barrier[];
  /** Resolved or closed barriers, with their history. */
  resolved: Barrier[];
  contributions: Contribution[];
  /** Approved field surveys of this place or a spot at it, newest first. */
  surveys: PublicSurvey[];
  /** Open barriers linked to other places close by. Never counted as this place's, and labelled as such. */
  nearby: NearbyBarrier[];
  summary: {
    features: number;
    withRecord: number;
    unknown: number;
    byProvenance: Record<"osm" | "community" | "verified" | "owner_recorded", number>;
    conflicts: number;
    outdated: number;
    openBarriers: number;
    lastObservedOn?: string;
    lastUpdatedAt?: string;
  };
}

export interface NearbyBarrier {
  reportId: string;
  title: string;
  placeName: string;
  place: Pick<PlaceRef, "osmType" | "osmId">;
  distanceMeters: number;
  needGroups: NeedGroup[];
}

export interface IntelligenceInput {
  place: Pick<PlaceRef, "osmType" | "osmId">;
  tags: Record<string, string>;
  lastEdited?: string;
  observations: Observation[];
  reports: SavedReport[];
  /** Approved surveys only; see lib/survey.ts publicSurvey. */
  surveys?: PublicSurvey[];
  /** This place's own position, needed to list open barriers at places nearby. */
  coordinates?: { latitude: number; longitude: number };
  now?: Date;
}

const samePlace = (a: Pick<PlaceRef, "osmType" | "osmId"> | undefined, b: Pick<PlaceRef, "osmType" | "osmId">) =>
  Boolean(a) && a!.osmType === b.osmType && a!.osmId === b.osmId;

const days = (from: string, to: string) => Math.abs(Date.parse(to) - Date.parse(from)) / DAY_MS;

/** Whether a report was saved by the owner or a reviewer, so their own check of it is not independent. */
export function isStaffSubmitted(report: { moderation?: { note?: string } }): boolean {
  return Boolean(report.moderation?.note?.startsWith("Saved by"));
}

// ------------------------------------------------------------------ observations

interface Cluster {
  rep: Observation;
  members: { obs: Observation; kind?: ResponseKind }[];
  disputes?: Cluster;
  supersededBy?: Cluster;
}

function clusterObservations(observations: Observation[]): Cluster[] {
  const sorted = [...observations].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const clusterOf = new Map<string, Cluster>();
  const clusters: Cluster[] = [];
  const lastSeen = (c: Cluster) => c.members.map((m) => m.obs.observedOn).sort().at(-1)!;

  for (const obs of sorted) {
    const target = obs.respondsTo ? clusterOf.get(obs.respondsTo.id) : undefined;
    const kind = target ? obs.respondsTo!.kind : undefined;
    if (target && (kind === "confirm" || kind === "evidence")) {
      target.members.push({ obs, kind });
      clusterOf.set(obs.id, target);
      continue;
    }
    if (!target) {
      // The same thing, seen again: one claim however each person words it. Never into a claim that was updated.
      const same = clusters.find(
        (c) =>
          !c.supersededBy &&
          c.rep.featureId === obs.featureId &&
          c.rep.area === obs.area &&
          c.rep.finding === obs.finding &&
          days(lastSeen(c), obs.observedOn) <= DUPLICATE_WINDOW_DAYS,
      );
      if (same) {
        same.members.push({ obs });
        clusterOf.set(obs.id, same);
        continue;
      }
    }
    const cluster: Cluster = { rep: obs, members: [{ obs, kind }] };
    if (target && kind === "update") target.supersededBy = cluster;
    if (target && kind === "dispute") cluster.disputes = target;
    clusters.push(cluster);
    clusterOf.set(obs.id, cluster);
  }
  return clusters;
}

function claimOf(cluster: Cluster, now: Date): Claim {
  const dates = cluster.members.map((m) => m.obs.observedOn).sort();
  // A check by the team of its own observation is not independent.
  const checked = cluster.members.map((m) => m.obs).filter((o) => observationStatus(o) === "verified" && o.statusHistory.at(-1)?.note);
  const verifiedMember = checked.find((o) => !isStaffSubmitted(o));
  const latest = [...cluster.members].sort((a, b) => b.obs.createdAt.localeCompare(a.obs.createdAt))[0].obs;
  const rep = cluster.rep;
  const observedOn = dates.at(-1)!;
  return {
    id: rep.id,
    source: "observation",
    provenance: verifiedMember ? "verified" : "community",
    polarity: FINDING_POLARITY[rep.finding],
    finding: rep.finding,
    value: `${FINDING_LABEL[rep.finding]} · ${AREA_LABEL[rep.area]}`,
    area: rep.area,
    scope: scopeNote(rep.area),
    observedOn,
    firstObservedOn: dates[0],
    recordedAt: latest.createdAt,
    detail: latest.note || rep.note || undefined,
    count: cluster.members.filter((m) => m.kind !== "evidence").length,
    contributionIds: cluster.members.map((m) => m.obs.id),
    hasPhoto: cluster.members.some((m) => m.obs.hasPhoto),
    verifiedNote: verifiedMember?.statusHistory.at(-1)?.note,
    verificationCaveat:
      !verifiedMember && checked.length ? "Checked by the project team on its own observation, so this is not an independent check." : undefined,
    outdated: isStale(observedOn, now),
    inConflict: false,
    supersededBy: cluster.supersededBy?.rep.id,
  };
}

// ------------------------------------------------------------------ reports

function barrierOf(report: SavedReport, now: Date): Barrier | undefined {
  const items: BarrierItem[] = [
    ...report.analysis.findings.flatMap((f): BarrierItem[] => {
      const review = report.reviews[f.id];
      if (review?.decision === "rejected") return [];
      const category = review?.decision === "corrected" ? (review.correctedCategory ?? f.category) : f.category;
      return [
        {
          title: f.title,
          category,
          categoryLabel: CATEGORY_INFO[category].label,
          description: f.observed_condition,
          provenance: review?.decision ? "reporter_confirmed" : "ai",
        },
      ];
    }),
    ...report.missedIssues.map(
      (m): BarrierItem => ({
        title: CATEGORY_INFO[m.category].label,
        category: m.category,
        categoryLabel: CATEGORY_INFO[m.category].label,
        description: m.description,
        provenance: "reporter_confirmed",
      }),
    ),
  ];
  if (!items.length) return undefined;

  const history = statusHistory(report);
  const latest = currentStatus(report);
  const open = latest.status !== "resolved" && latest.status !== "closed";
  const verifiedEvent = [...history].reverse().find((e) => e.status === "verified" && e.note.trim());
  const staff = isStaffSubmitted(report);
  const independent = Boolean(verifiedEvent) && !staff;
  const verifiedWithoutReason = history.some((e) => e.status === "verified") && !verifiedEvent;

  const provenance: Barrier["provenance"] =
    latest.status === "resolved"
      ? "resolved"
      : independent
        ? "verified"
        : items.some((i) => i.provenance === "reporter_confirmed")
          ? "reporter_confirmed"
          : "ai";
  const categories = [...new Set(items.map((i) => i.category))];
  const lastTouched = history.map((e) => e.at).sort().at(-1) ?? report.createdAt;
  const needs = new Set(categories.flatMap((c) => CATEGORY_INFO[c].needs));
  const location = report.location;

  return {
    reportId: report.id,
    items,
    area: report.area,
    areaLabel: report.area ? AREA_LABEL[report.area] : undefined,
    scope: scopeNote(report.area),
    needGroups: NEED_GROUPS.filter((g) => needs.has(g)),
    affectedFeatureIds: [...new Set(categories.flatMap((c) => CATEGORY_FEATURES[c]))],
    reportedAt: report.createdAt,
    observedOn: report.observedOn,
    status: latest.status,
    statusLabel: STATUS_INFO[latest.status].label,
    statusNote: latest.note,
    statusAt: latest.at,
    provenance,
    verifiedNote: independent ? verifiedEvent!.note : undefined,
    verificationCaveat:
      staff && verifiedEvent
        ? "Marked verified by the project team on its own report, so this is not an independent check."
        : verifiedWithoutReason
          ? "Marked verified without a recorded reason, so it is not counted as independently verified."
          : undefined,
    open,
    resolution: latest.status === "resolved" ? { at: latest.at, note: latest.note } : undefined,
    closedAs: latest.status === "closed" ? { duplicateOf: latest.duplicateOf, note: latest.note } : undefined,
    recheckDue: open && days(lastTouched, now.toISOString()) > BARRIER_RECHECK_DAYS,
    history,
    placeCoordinates: location?.placeCoordinates,
    observationCoordinates: location?.observationCoordinates,
  };
}

// ------------------------------------------------------------------ the profile

const SURVEY_POLARITY: Record<string, Polarity> = { present: "yes", absent: "no", not_operational: "problem", obstructed: "problem" };

/** What each approved survey says about one feature. A survey speaks only for its own spot. */
function surveyClaims(surveys: PublicSurvey[], featureId: string): Claim[] {
  const claims: Claim[] = [];
  for (const survey of surveys) {
    for (const answer of survey.assessed.filter((a: PublicAnswer) => a.featureId === featureId && a.raw !== "not_applicable")) {
      const spot = survey.sublocationId ? `sub:${survey.sublocationId}` : "place";
      const same = claims.find((c) => c.spot === spot && c.value === answer.value && !c.supersededBy && !survey.supersededBy && days(c.observedOn!, survey.observedOn) <= DUPLICATE_WINDOW_DAYS);
      if (same) {
        same.count++;
        if (survey.observedOn > same.observedOn!) same.observedOn = survey.observedOn;
        continue;
      }
      claims.push({
        id: `${survey.id}:${answer.attributeId}`,
        source: "survey",
        provenance: survey.provenance as Claim["provenance"],
        polarity: SURVEY_POLARITY[String(answer.raw)],
        value: answer.value,
        spot,
        area: survey.sublocationType ? SUBLOCATION_AREA[survey.sublocationType] : undefined,
        scope: survey.sublocationId
          ? `Applies to ${survey.target} only, not to the whole place.`
          : "Recorded for the place as a whole. Individual entrances and rooms may differ.",
        observedOn: survey.observedOn,
        recordedAt: survey.updatedAt,
        detail: answer.note,
        count: 1,
        contributionIds: [],
        hasPhoto: answer.photoIds.length > 0,
        photoUrls: answer.photoIds.map((id: string) => `/api/surveys/photos/${id}`),
        verifiedNote: survey.provenance === "verified" ? survey.checkNote : undefined,
        outdated: survey.outdated,
        inConflict: false,
        supersededBy: survey.supersededBy,
      });
    }
  }
  return claims;
}

/** Reports linked to another place within this distance are mentioned, separately, as nearby. */
export const NEARBY_METERS = 150;

function nearbyBarriers(input: IntelligenceInput, now: Date): NearbyBarrier[] {
  const here = input.coordinates;
  if (!here) return [];
  return input.reports
    .flatMap((report): NearbyBarrier[] => {
      const location = report.location;
      const position = location?.placeCoordinates ?? (location?.latitude !== undefined && location.longitude !== undefined ? { latitude: location.latitude, longitude: location.longitude } : undefined);
      if (!isPublic(report) || !location?.place || samePlace(location.place, input.place) || !position) return [];
      const distance = distanceMeters(here, position);
      const barrier = distance <= NEARBY_METERS ? barrierOf(report, now) : undefined;
      if (!barrier?.open) return [];
      return [{ reportId: report.id, title: barrier.items[0].title, placeName: location.place.name, place: location.place, distanceMeters: distance, needGroups: barrier.needGroups }];
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

const polarityWords = (set: Set<Polarity>) => [...set].map((p) => POLARITY_LABEL[p]).join(" / ");

export function buildPlaceIntelligence(input: IntelligenceInput): PlaceIntelligence {
  const now = input.now ?? new Date();
  const observations = input.observations.filter((o) => isPublic(o) && samePlace(o.place, input.place));
  const reports = input.reports.filter((r) => isPublic(r) && samePlace(r.location?.place, input.place));

  const surveys = (input.surveys ?? [])
    .filter((s) => samePlace(s.place, input.place))
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn));
  const clusters = clusterObservations(observations);
  const clusterOfId = new Map<string, Cluster>();
  for (const c of clusters) for (const m of c.members) clusterOfId.set(m.obs.id, c);

  const features: FeatureIntel[] = placeAttributes(input.tags).map((attr) => {
    const claims: Claim[] = clusters.filter((c) => c.rep.featureId === attr.id).map((c) => claimOf(c, now));
    claims.push(...surveyClaims(surveys, attr.id));
    if (attr.state === "community" && attr.value) {
      const date = attr.checked ?? input.lastEdited?.slice(0, 10);
      claims.push({
        id: "osm",
        source: "osm",
        provenance: "osm",
        polarity: attr.polarity,
        value: attr.value,
        scope: "As recorded by OpenStreetMap volunteers for this place.",
        observedOn: date,
        detail: attr.detail,
        count: 1,
        contributionIds: [],
        hasPhoto: false,
        outdated: isStale(date, now),
        inConflict: false,
      });
    }
    const current = claims.filter((c) => !c.supersededBy);
    const history = claims.filter((c) => c.supersededBy);
    const order = (a: Claim, b: Claim) =>
      (RANK[a.provenance] ?? 9) - (RANK[b.provenance] ?? 9) || (b.observedOn ?? "").localeCompare(a.observedOn ?? "");

    // Disagreement: different kinds of statement about the same spot (OpenStreetMap speaks for the whole place),
    // or an observation someone marked as disputing another.
    const spotOf = (c: Claim) => c.spot ?? c.area;
    const spots = new Set<string>(current.flatMap((c) => (spotOf(c) ? [spotOf(c)!] : [])));
    const conflictAreas: (PlaceArea | "any")[] = [];
    const conflictIds = new Set<string>();
    for (const spot of spots) {
      const here = current.filter((c) => spotOf(c) === spot || c.source === "osm");
      const kinds = new Set(here.map((c) => c.polarity).filter((p): p is Polarity => Boolean(p)));
      if (kinds.size > 1) {
        conflictAreas.push(here.find((c) => spotOf(c) === spot)?.area ?? "any");
        here.forEach((c) => c.polarity && conflictIds.add(c.id));
      }
    }
    for (const c of clusters.filter((c) => c.rep.featureId === attr.id && c.disputes && !c.supersededBy && !c.disputes.supersededBy)) {
      conflictIds.add(c.rep.id);
      conflictIds.add(c.disputes!.rep.id);
      if (!conflictAreas.includes(c.rep.area)) conflictAreas.push(c.rep.area);
    }
    current.forEach((c) => (c.inConflict = conflictIds.has(c.id)));
    const inConflict = current.filter((c) => c.inConflict).sort(order);
    const conflict: Conflict | undefined = inConflict.length
      ? {
          areas: conflictAreas,
          claimIds: inConflict.map((c) => c.id),
          hasVerified: inConflict.some((c) => c.provenance === "verified"),
          summary: `Records disagree: ${polarityWords(new Set(inConflict.map((c) => c.polarity).filter((p): p is Polarity => Boolean(p))))}. All are shown; none has been chosen as correct.`,
        }
      : undefined;

    current.sort(order);
    history.sort((a, b) => (b.observedOn ?? "").localeCompare(a.observedOn ?? ""));
    const best = current[0];
    return {
      id: attr.id,
      label: attr.label,
      group: attr.group,
      needIds: attr.needIds,
      current: best?.provenance ?? "unknown",
      claims: current,
      history,
      conflict,
      barrierIds: [],
      observedOn: current.map((c) => c.observedOn ?? "").sort().at(-1) || undefined,
      outdated: best ? best.outdated : false,
    };
  });

  const all = reports.map((r) => barrierOf(r, now)).filter((b): b is Barrier => Boolean(b));
  const barriers = all.filter((b) => b.open).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  const resolved = all.filter((b) => !b.open).sort((a, b) => b.statusAt.localeCompare(a.statusAt));
  for (const b of barriers) for (const id of b.affectedFeatureIds) features.find((f) => f.id === id)?.barrierIds.push(b.reportId);

  const contributions: Contribution[] = observations
    .map((o): Contribution => {
      const cluster = clusterOfId.get(o.id)!;
      const member = cluster.members.find((m) => m.obs.id === o.id)!;
      const verified = observationStatus(o) === "verified" && Boolean(o.statusHistory.at(-1)?.note) && !isStaffSubmitted(o);
      const feature = features.find((f) => f.id === o.featureId);
      const claim = [...(feature?.claims ?? []), ...(feature?.history ?? [])].find((c) => c.id === cluster.rep.id);
      const answers = o.respondsTo && clusterOfId.has(o.respondsTo.id) ? o.respondsTo : undefined;
      return {
        id: o.id,
        featureId: o.featureId,
        featureLabel: feature?.label ?? o.featureId,
        finding: FINDING_LABEL[o.finding],
        area: o.area,
        areaLabel: AREA_LABEL[o.area],
        observedOn: o.observedOn,
        recordedAt: o.createdAt,
        note: o.note,
        hasPhoto: o.hasPhoto,
        provenance: verified ? "verified" : "community",
        verifiedNote: verified ? o.statusHistory.at(-1)!.note : undefined,
        responseKind: answers?.kind,
        respondsTo: answers?.id,
        mergedInto: cluster.rep.id !== o.id && !member.kind ? cluster.rep.id : undefined,
        superseded: Boolean(cluster.supersededBy),
        inConflict: Boolean(claim?.inConflict),
        observationCoordinates: o.observationCoordinates,
      };
    })
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  const byProvenance = { osm: 0, community: 0, verified: 0, owner_recorded: 0 };
  for (const f of features) if (f.current === "osm" || f.current === "community" || f.current === "verified" || f.current === "owner_recorded") byProvenance[f.current]++;
  const observedDates = [...contributions.map((c) => c.observedOn), ...all.map((b) => b.observedOn ?? b.reportedAt.slice(0, 10)), ...surveys.map((s) => s.observedOn)].sort();
  const updates = [...contributions.map((c) => c.recordedAt), ...all.flatMap((b) => [b.reportedAt, ...b.history.map((e) => e.at)]), ...surveys.map((s) => s.updatedAt)].sort();
  return {
    features,
    barriers,
    resolved,
    contributions,
    surveys,
    nearby: nearbyBarriers(input, now),
    summary: {
      features: features.length,
      withRecord: features.filter((f) => f.current !== "unknown").length,
      unknown: features.filter((f) => f.current === "unknown").length,
      byProvenance,
      conflicts: features.filter((f) => f.conflict).length,
      outdated: features.filter((f) => f.outdated).length,
      openBarriers: barriers.length,
      lastObservedOn: observedDates.at(-1),
      lastUpdatedAt: updates.at(-1),
    },
  };
}
