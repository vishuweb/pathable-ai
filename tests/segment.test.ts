// SAM 3.1 evidence against a mocked Meta API: matching masks to findings, and failing gracefully.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startMockMeta } from "./mock-meta";

const W = 400;
const H = 300;
const mock = await startMockMeta({ width: W, height: H });
process.env.META_API_BASE_URL = mock.url;
process.env.MODEL_API_KEY = "test-key-not-real";
const { segmentEvidence } = await import("../lib/segment");
after(mock.close);
beforeEach(() => mock.replies.sam.clear());

const IMAGE = "data:image/jpeg;base64,/9j/AA==";
// Pixel boxes on the 400x300 mock image, and the same areas on the model's 0-1000 scale.
const LEFT_HALF = { x_min: 0, y_min: 0, x_max: 500, y_max: 1000 };
const RIGHT_HALF = { x_min: 500, y_min: 0, x_max: 1000, y_max: 1000 };
const IN_LEFT: [number, number, number, number] = [40, 100, 160, 250];
const IN_RIGHT: [number, number, number, number] = [260, 100, 380, 250];
const samCalls = () => mock.requests.filter((r) => r.path.endsWith("/responses")).length;

test("objects inside the finding's area become its outlined evidence", async () => {
  mock.replies.sam.set("electric scooter", { kind: "objects", boxes: [IN_LEFT, IN_RIGHT] });
  const [evidence] = await segmentEvidence(IMAGE, W, H, [{ findingId: "f1", phrase: "electric scooter", box: LEFT_HALF }]);
  assert.equal(evidence.status, "segmented");
  assert.equal(evidence.regions.length, 1, "the object on the other side is not evidence");
  assert.deepEqual(evidence.regions[0].box, { left: 40, top: 100, right: 160, bottom: 250 });
  assert.match(evidence.regions[0].path, /^[MLZ0-9 .-]+$/, "a plain SVG path, safe to render");
  assert.match(evidence.note, /SAM 3.1 outlined 1 object/);
});

test("when SAM finds nothing in the area, the finding falls back to an approximate box", async () => {
  mock.replies.sam.set("stairs", { kind: "objects", boxes: [IN_RIGHT] });
  const [evidence] = await segmentEvidence(IMAGE, W, H, [{ findingId: "f1", phrase: "stairs", box: LEFT_HALF }]);
  assert.equal(evidence.status, "approximate");
  assert.equal(evidence.regions.length, 0);
  assert.deepEqual(evidence.modelBox, { left: 0, top: 0, right: 200, bottom: 300 });
});

test("a failed or truncated SAM call marks only that finding unavailable", async () => {
  mock.replies.sam.set("parked car", { kind: "objects", boxes: [IN_LEFT] });
  mock.replies.sam.set("bollard", { kind: "incomplete" });
  mock.replies.sam.set("bench", { kind: "reset" });
  const evidence = await segmentEvidence(IMAGE, W, H, [
    { findingId: "car", phrase: "parked car", box: LEFT_HALF },
    { findingId: "bollard", phrase: "bollard", box: LEFT_HALF },
    { findingId: "bench", phrase: "bench", box: RIGHT_HALF },
  ]);
  assert.deepEqual(
    evidence.map((e) => [e.findingId, e.status]),
    [
      ["car", "segmented"],
      ["bollard", "unavailable"],
      ["bench", "unavailable"],
    ],
  );
});

test("each phrase is segmented once, and objects are split between findings that share it", async () => {
  mock.replies.sam.set("parked car", { kind: "objects", boxes: [IN_LEFT, IN_RIGHT] });
  const before = samCalls();
  const [left, right] = await segmentEvidence(IMAGE, W, H, [
    { findingId: "left", phrase: "Parked  Car ", box: LEFT_HALF },
    { findingId: "right", phrase: "parked car", box: RIGHT_HALF },
  ]);
  assert.equal(samCalls() - before, 1);
  assert.equal(left.regions.length, 1);
  assert.equal(right.regions.length, 1);
  assert.notEqual(left.regions[0].objectId, right.regions[0].objectId, "no object is counted twice");
});

test("two findings about the same single object both show it", async () => {
  mock.replies.sam.set("electric scooter", { kind: "objects", boxes: [IN_LEFT] });
  const [ramp, footpath] = await segmentEvidence(IMAGE, W, H, [
    { findingId: "ramp", phrase: "electric scooter", box: LEFT_HALF },
    { findingId: "footpath", phrase: "electric scooter", box: LEFT_HALF },
  ]);
  assert.equal(ramp.regions.length, 1);
  assert.equal(footpath.regions.length, 1);
  assert.match(footpath.note, /also cited by another finding/);
});
