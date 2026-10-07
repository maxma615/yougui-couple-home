import { describe, expect, it } from "vitest";
import { quadToMatrix3d } from "@/components/mahjong/projected-geometry";

type Point = { x: number; y: number };
type Camera = { a: number; b: number; c: number; d: number; e: number; f: number; j: number; k: number; g: number; h: number; i: number };

function project(camera: Camera, x: number, y: number, z: number): Point {
  const w = camera.g * x + camera.h * y + camera.i * z + 1;
  return { x: (camera.a * x + camera.b * y + camera.c * z + camera.d) / w,
    y: (camera.e * x + camera.f * y + camera.j * z + camera.k) / w };
}

function matrixPoint(css: string, x: number, y: number, z: number, offset: Point): Point {
  const m = css.slice(9, -1).split(",").map(Number);
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return { x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w + offset.x,
    y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w + offset.y };
}

function cameraFor(yaw: number, tilt: number): Camera {
  const alpha = yaw * Math.PI / 180;
  const theta = tilt * Math.PI / 180;
  const perspective = 1100;
  return { a: Math.cos(alpha), b: -Math.sin(alpha), c: .12, d: 437,
    e: Math.sin(alpha) * Math.cos(theta), f: Math.cos(alpha) * Math.cos(theta), j: -Math.sin(theta), k: 208,
    g: -Math.sin(alpha) * Math.sin(theta) / perspective,
    h: -Math.cos(alpha) * Math.sin(theta) / perspective,
    i: -Math.cos(theta) / perspective };
}

describe("physical tile projection", () => {
  for (const yaw of [0, -90, 180, 90]) {
    for (const tilt of [28, -62]) {
      it(`retains the measured normal at yaw ${yaw}, tilt ${tilt}`, () => {
        const camera = cameraFor(yaw, tilt);
        const width = 28, height = 39.2, depth = height * .4;
        const offset = { x: 401, y: 173 };
        const quad = { topLeft: project(camera, 0, 0, 0), topRight: project(camera, width, 0, 0),
          bottomRight: project(camera, width, height, 0), bottomLeft: project(camera, 0, height, 0) };
        const normal = { depth, topLeft: project(camera, 0, 0, depth), topRight: project(camera, width, 0, depth) };
        const css = quadToMatrix3d(width, height, quad, offset.x, offset.y, normal);
        expect(css).not.toBeNull();
        // Bottom corners and intermediate depths are independent hold-outs;
        // the normal is sampled only at the two top corners.
        for (const [x, y, z] of [[0, 0, 0], [width, height, 0], [0, height, depth],
          [width, height, -depth], [width / 2, height / 2, depth / 2]]) {
          const actual = matrixPoint(css!, x, y, z, offset);
          const expected = project(camera, x, y, z);
          expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(.002);
        }
      });
    }
  }

  it("preserves the existing planar output when no normal was measured", () => {
    const quad = { topLeft: { x: 10, y: 20 }, topRight: { x: 50, y: 20 },
      bottomRight: { x: 50, y: 76 }, bottomLeft: { x: 10, y: 76 } };
    expect(quadToMatrix3d(40, 56, quad, 5, 7)).toBe("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 13, 0, 1)");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid measured depth %s", depth => {
    const quad = { topLeft: { x: 10, y: 20 }, topRight: { x: 50, y: 20 },
      bottomRight: { x: 50, y: 76 }, bottomLeft: { x: 10, y: 76 } };
    expect(quadToMatrix3d(40, 56, quad, 0, 0, { depth, topLeft: { x: 10, y: 15 }, topRight: { x: 50, y: 15 } })).toBeNull();
  });

  it("rejects a collapsed raised-plane measurement", () => {
    const quad = { topLeft: { x: 10, y: 20 }, topRight: { x: 50, y: 20 },
      bottomRight: { x: 50, y: 76 }, bottomLeft: { x: 10, y: 76 } };
    expect(quadToMatrix3d(40, 56, quad, 0, 0, { depth: 22.4, topLeft: { x: 30, y: 15 }, topRight: { x: 30, y: 15 } })).toBeNull();
  });
});
