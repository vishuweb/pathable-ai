import assert from "node:assert/strict";
import { test } from "node:test";
import { containment, iou, padBox, toPixelBox, unionBox } from "../lib/geometry";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

test("model boxes on a 0-1000 scale map to pixels", () => {
  assert.deepEqual(toPixelBox({ x_min: 0, y_min: 500, x_max: 1000, y_max: 1000 }, 1600, 1200), box(0, 600, 1600, 1200));
});

test("overlap measures", () => {
  assert.equal(iou(box(0, 0, 10, 10), box(0, 0, 10, 10)), 1);
  assert.equal(iou(box(0, 0, 10, 10), box(20, 20, 30, 30)), 0);
  assert.equal(iou(box(0, 0, 10, 10), box(5, 0, 15, 10)), 50 / 150);
  // A small object fully inside a large box is fully contained, even though IoU is tiny.
  assert.equal(containment(box(10, 10, 20, 20), box(0, 0, 100, 100)), 1);
  assert.ok(iou(box(10, 10, 20, 20), box(0, 0, 100, 100)) < 0.02);
  assert.equal(containment(box(0, 0, 0, 0), box(0, 0, 10, 10)), 0);
});

test("padding grows a box by at least 10 px and stays inside the image", () => {
  assert.deepEqual(padBox(box(100, 100, 200, 200), 0.15, 1000, 1000), box(85, 85, 215, 215));
  assert.deepEqual(padBox(box(0, 0, 20, 20), 0.15, 25, 25), box(0, 0, 25, 25));
});

test("union of boxes", () => {
  assert.deepEqual(unionBox([box(0, 0, 10, 10), box(5, 5, 20, 30)]), box(0, 0, 20, 30));
  assert.equal(unionBox([]), undefined);
});
