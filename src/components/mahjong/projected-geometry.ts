import type { MotionQuad } from "./discard-motion";

/**
 * Maps a local border-box rectangle to four viewport points. The optional
 * layout offset lets a fixed portal keep its existing center-based left/top
 * coordinates while the matrix itself is relative to that layout origin.
 */
export function quadToMatrix3d(width: number, height: number, quad: MotionQuad, offsetX = 0, offsetY = 0) {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)
    || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)
    || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;

  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  const dx1 = topRight.x - bottomRight.x;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy1 = topRight.y - bottomRight.y;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) return null;

  const g = (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = topRight.x - topLeft.x + g * topRight.x;
  const b = bottomLeft.x - topLeft.x + h * bottomLeft.x;
  const c = topRight.y - topLeft.y + g * topRight.y;
  const d = bottomLeft.y - topLeft.y + h * bottomLeft.y;

  const m14 = g / width;
  const m24 = h / height;
  const values = [
    a / width - offsetX * m14,
    c / width - offsetY * m14,
    0,
    m14,
    b / height - offsetX * m24,
    d / height - offsetY * m24,
    0,
    m24,
    0,
    0,
    1,
    0,
    topLeft.x - offsetX,
    topLeft.y - offsetY,
    0,
    1,
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;
  return `matrix3d(${values.map((value) => Number(value.toFixed(8))).join(", ")})`;
}
