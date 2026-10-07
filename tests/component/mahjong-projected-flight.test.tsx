// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DiscardFlightLayer, measureDiscardElement } from "@/components/mahjong/use-discard-motion";

const originalRect = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect");
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  if (originalRect) Object.defineProperty(Element.prototype, "getBoundingClientRect", originalRect);
  else Reflect.deleteProperty(Element.prototype, "getBoundingClientRect");
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(Element.prototype, "animate");
});

it("captures all four transformed tile corners and leaves the measured node untouched", () => {
  const corners = {
    "top-left": { x: 82, y: 118 },
    "top-right": { x: 132, y: 127 },
    "bottom-right": { x: 144, y: 205 },
    "bottom-left": { x: 73, y: 194 },
  };
  const element = document.createElement("button");
  element.style.cssText = "width: 44px; height: 62px; color: red;";
  const originalStyle = element.getAttribute("style");
  document.body.append(element);

  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: Element) {
      if (this === element) {
        return { x: 70, y: 118, left: 70, top: 118, right: 144, bottom: 205, width: 74, height: 87, toJSON: () => ({}) };
      }
      const corner = (this as HTMLElement).dataset.discardMotionCorner;
      const point = corner ? corners[corner as keyof typeof corners] : undefined;
      if (point) {
        return { x: point.x, y: point.y, left: point.x, top: point.y, right: point.x, bottom: point.y, width: 0, height: 0, toJSON: () => ({}) };
      }
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
    },
  });

  const measured = measureDiscardElement(element);

  expect(measured?.geometry.quad).toEqual({
    topLeft: corners["top-left"],
    topRight: corners["top-right"],
    bottomRight: corners["bottom-right"],
    bottomLeft: corners["bottom-left"],
  });
  expect(measured?.geometry).toMatchObject({ width: 44, height: 62 });
  expect(element.childElementCount).toBe(0);
  expect(element.getAttribute("style")).toBe(originalStyle);

  element.remove();
});

it("animates the portal through projected source and river corners", () => {
  const sourceQuad = {
    topLeft: { x: 128, y: 219 },
    topRight: { x: 163, y: 224 },
    bottomRight: { x: 175, y: 278 },
    bottomLeft: { x: 134, y: 274 },
  };
  const riverQuad = {
    topLeft: { x: 453, y: 218 },
    topRight: { x: 481, y: 227 },
    bottomRight: { x: 476, y: 265 },
    bottomLeft: { x: 446, y: 256 },
  };
  const calls: Array<{ target: Element; frames: Keyframe[] }> = [];
  const animation = { cancel() {}, onfinish: null } as unknown as Animation;
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value(this: Element, frames: Keyframe[]) {
      calls.push({ target: this, frames });
      return animation;
    },
  });
  const flight = {
    event: { id: "discard:room-a:game-a:4:2:0", roomId: "room-a", gameInstanceId: "game-a", handId: 4, seat: 2, index: 0, tile: "s4" },
    source: "opponent" as const,
    from: { left: 152, top: 248, width: 44, height: 62, angle: 0, scale: 1, quad: sourceQuad },
    to: { left: 463, top: 242, width: 30, height: 40, angle: 0, scale: 1, quad: riverQuad },
  };

  render(<DiscardFlightLayer flight={flight as never} onFinish={() => {}}/>);

  const movement = calls.find((call) => call.target === screen.getByTestId("mahjong-discard-flight"));
  expect(movement).toBeDefined();
  expectQuadNear(projectedFrameCorners(movement!.frames[0], 44, 62), sourceQuad);
  expectQuadNear(projectedFrameCorners(movement!.frames[1], 30, 40), riverQuad);
});

function expectQuadNear(actual: ReturnType<typeof projectedFrameCorners>, expected: typeof actual) {
  for (const corner of ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const) {
    expect(actual[corner].x).toBeCloseTo(expected[corner].x, 2);
    expect(actual[corner].y).toBeCloseTo(expected[corner].y, 2);
  }
}

function projectedFrameCorners(frame: Keyframe, width: number, height: number) {
  const transform = String(frame.transform);
  const serialized = transform.match(/matrix3d\(([^)]+)\)/)?.[1];
  if (!serialized) throw new Error(`Expected a projected matrix3d keyframe, got ${transform}`);
  const m = serialized.split(",").map(Number);
  if (m.length !== 16 || m.some((value) => !Number.isFinite(value))) throw new Error("Expected sixteen finite matrix3d coefficients");
  const left = Number.parseFloat(String(frame.left));
  const top = Number.parseFloat(String(frame.top));
  const project = (x: number, y: number) => {
    const divisor = m[3] * x + m[7] * y + m[15];
    return {
      x: left + (m[0] * x + m[4] * y + m[12]) / divisor,
      y: top + (m[1] * x + m[5] * y + m[13]) / divisor,
    };
  };
  return {
    topLeft: project(0, 0),
    topRight: project(width, 0),
    bottomRight: project(width, height),
    bottomLeft: project(0, height),
  };
}
