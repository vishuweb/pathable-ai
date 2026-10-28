import type { NormalizedBox, PixelBox } from "./types";

export function toPixelBox(box: NormalizedBox, width: number, height: number): PixelBox {
  return {
    left: Math.round((box.x_min / 1000) * width),
    top: Math.round((box.y_min / 1000) * height),
    right: Math.round((box.x_max / 1000) * width),
    bottom: Math.round((box.y_max / 1000) * height),
  };
}

export function area(b: PixelBox): number {
  return Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
}

export function intersection(a: PixelBox, b: PixelBox): number {
  return area({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });
}

export function iou(a: PixelBox, b: PixelBox): number {
  const inter = intersection(a, b);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** Share of `inner` that lies inside `outer` (0–1). */
export function containment(inner: PixelBox, outer: PixelBox): number {
  const a = area(inner);
  return a > 0 ? intersection(inner, outer) / a : 0;
}

/** Grows a box by a fraction of its size on every side, clamped to the image. */
export function padBox(b: PixelBox, fraction: number, width: number, height: number): PixelBox {
  const dx = Math.max(10, (b.right - b.left) * fraction);
  const dy = Math.max(10, (b.bottom - b.top) * fraction);
  return {
    left: Math.max(0, Math.floor(b.left - dx)),
    top: Math.max(0, Math.floor(b.top - dy)),
    right: Math.min(width, Math.ceil(b.right + dx)),
    bottom: Math.min(height, Math.ceil(b.bottom + dy)),
  };
}

export function unionBox(boxes: PixelBox[]): PixelBox | undefined {
  if (!boxes.length) return undefined;
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    top: Math.min(...boxes.map((b) => b.top)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}
