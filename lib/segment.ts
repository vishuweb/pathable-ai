import "server-only";
import {
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
  type ImageSegmentationResult,
} from "@meta-sam/parser";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { containment, iou, padBox, toPixelBox } from "./geometry";
import { SEGMENTATION_MODEL, getMetaClient } from "./meta";
import type { Evidence, EvidenceRegion, PixelBox, SegmentTarget } from "./types";

/** How much of a SAM instance must lie inside the (padded) model box to count as evidence. */
const MIN_CONTAINMENT = 0.4;
/** Tolerance for imprecise model boxes, as a fraction of box size per side. */
const BOX_PADDING = 0.15;
/** Below this IoU, a lone best-overlap instance is not trusted as evidence. */
const MIN_FALLBACK_IOU = 0.1;

/** Segments the evidence for each finding. One SAM call per unique phrase, run in parallel. */
export async function segmentEvidence(
  image: string,
  width: number,
  height: number,
  targets: SegmentTarget[],
): Promise<Evidence[]> {
  const phrases = [...new Set(targets.map((t) => normalizePhrase(t.phrase)))];
  const settled = await Promise.allSettled(phrases.map((p) => segmentPhrase(image, p)));
  const byPhrase = new Map(phrases.map((p, i) => [p, settled[i]]));
  const owners = assignOwners(targets, byPhrase, width, height);

  return targets.map((target) => {
    const phrase = normalizePhrase(target.phrase);
    const modelBox = toPixelBox(target.box, width, height);
    const outcome = byPhrase.get(phrase);

    if (!outcome || outcome.status === "rejected") {
      console.error(`[segment] SAM failed for "${phrase}"`, outcome?.reason);
      return {
        findingId: target.findingId,
        phrase,
        status: "unavailable",
        regions: [],
        modelBox,
        note: "Segmentation was unavailable, so only the approximate area is shown.",
      };
    }

    const regions = selectRegions(outcome.value, modelBox, width, height).filter(
      (r) => owners.get(`${phrase}#${r.objectId}`) === target.findingId,
    );
    return regions.length
      ? {
          findingId: target.findingId,
          phrase,
          status: "segmented",
          regions,
          modelBox,
          note: `SAM 3.1 outlined ${regions.length} ${regions.length === 1 ? "object" : "objects"} matching "${phrase}".`,
        }
      : {
          findingId: target.findingId,
          phrase,
          status: "approximate",
          regions: [],
          modelBox,
          note: `SAM 3.1 found no "${phrase}" in this area, so only the approximate area is shown. Check this finding carefully.`,
        };
  });
}

async function segmentPhrase(image: string, phrase: string): Promise<EvidenceRegion[]> {
  const params = {
    model: SEGMENTATION_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: phrase },
          { type: "input_image", image_url: image },
        ],
      },
    ],
    metadata: { include_confidence: "true", mask_encoding: "one_bit" },
    stream: true,
  } as ResponseCreateParamsStreaming; // SAM takes no `detail` on input_image, which the SDK types require.

  const stream = await getMetaClient().responses.create(params);
  const result = await parseImageStream(stream).finalResult;
  return toRegions(result);
}

function toRegions(result: ImageSegmentationResult): EvidenceRegion[] {
  const boxes = new Map(recordsOfKind(result.records, "box").map((b) => [b.objectId, b]));
  const regions: EvidenceRegion[] = [];
  for (const m of recordsOfKind(result.records, "mask")) {
    const path = decodeMaskToSVGPath(m.mask);
    if (!path) continue;
    regions.push({
      objectId: m.objectId,
      box: { ...m.bounds },
      path,
      maskWidth: m.mask.width,
      maskHeight: m.mask.height,
      confidence: m.confidence ?? boxes.get(m.objectId)?.confidence,
    });
  }
  return regions;
}

/**
 * Keeps SAM instances that sit mostly inside the analysis model's box. This handles both a single
 * object ("electric scooter") and a group ("parked scooters") without knowing which one was meant.
 * If none qualify, falls back to the single best-overlapping instance when the overlap is credible.
 */
function selectRegions(
  regions: EvidenceRegion[],
  modelBox: PixelBox,
  width: number,
  height: number,
): EvidenceRegion[] {
  const padded = padBox(modelBox, BOX_PADDING, width, height);
  const inside = regions.filter((r) => containment(r.box, padded) >= MIN_CONTAINMENT);
  if (inside.length) return inside;

  const best = regions
    .map((r) => ({ r, score: iou(r.box, modelBox) }))
    .sort((a, b) => b.score - a.score)[0];
  return best && best.score >= MIN_FALLBACK_IOU ? [best.r] : [];
}

/**
 * When several findings share a phrase (e.g. two groups of "electric scooters"), their boxes can
 * overlap. Each SAM object is given to the one finding whose box contains it most, so no object is
 * reported as evidence twice. Returns a map of "phrase#objectId" → findingId.
 */
function assignOwners(
  targets: SegmentTarget[],
  byPhrase: Map<string, PromiseSettledResult<EvidenceRegion[]>>,
  width: number,
  height: number,
): Map<string, string> {
  const best = new Map<string, { findingId: string; score: number }>();
  for (const target of targets) {
    const phrase = normalizePhrase(target.phrase);
    const outcome = byPhrase.get(phrase);
    if (outcome?.status !== "fulfilled") continue;
    const modelBox = toPixelBox(target.box, width, height);
    const padded = padBox(modelBox, BOX_PADDING, width, height);
    for (const region of selectRegions(outcome.value, modelBox, width, height)) {
      const key = `${phrase}#${region.objectId}`;
      const score = containment(region.box, padded) + iou(region.box, modelBox);
      if (score > (best.get(key)?.score ?? -1)) best.set(key, { findingId: target.findingId, score });
    }
  }
  return new Map([...best].map(([key, v]) => [key, v.findingId]));
}

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}
