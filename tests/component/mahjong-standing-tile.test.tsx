// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";

const componentPath = "@/components/mahjong/mahjong-standing-tile";

afterEach(cleanup);

async function loadStandingTile() {
  const module = await import(componentPath).catch(() => null);
  expect(module?.MahjongStandingTile).toBeTypeOf("function");
  if (!module) throw new Error("MahjongStandingTile module is missing");
  return module.MahjongStandingTile;
}

it("renders six distinct standing faces without adding an interactive role", async () => {
  const MahjongStandingTile = await loadStandingTile();
  const { container } = render(<MahjongStandingTile />);
  const tile = container.querySelector("i.mahjong-standing-tile");
  const faces = [...container.querySelectorAll("[data-standing-face]")];

  expect(tile).toBeInTheDocument();
  expect(tile).not.toHaveAttribute("data-standing-body");
  expect(tile?.querySelector("[data-standing-body]")).toBeInTheDocument();
  expect(faces.map(face => face.getAttribute("data-standing-face")).sort()).toEqual(
    ["back", "bottom", "front", "left", "right", "top"],
  );
  expect(faces.every(face => face.tagName === "SPAN" && face.getAttribute("aria-hidden") === "true")).toBe(true);
  expect(tile?.querySelector('[data-standing-face="back"][data-motion-surface="true"]')).toBeInTheDocument();
  expect(tile?.querySelectorAll("[data-motion-surface]")).toHaveLength(1);
  expect(container.querySelector("button, [role], a")).toBeNull();
});

it("keeps the front face blank and does not expose tile identity or artwork", async () => {
  const MahjongStandingTile = await loadStandingTile();
  const { container } = render(<MahjongStandingTile />);
  const front = container.querySelector('[data-standing-face="front"]');

  expect(front).toBeInTheDocument();
  expect(front).toBeEmptyDOMElement();
  expect(container.querySelector("img, [data-tile-face]")).toBeNull();
});

it("marks a drawn tile for existing rack layout and motion consumers", async () => {
  const MahjongStandingTile = await loadStandingTile();
  const { container } = render(<MahjongStandingTile drawn />);
  const tile = container.querySelector("i.mahjong-standing-tile");

  expect(tile).toHaveClass("is-drawn");
  expect(tile).toHaveAttribute("data-motion-drawn", "true");
});

it("does not replay a tile animation when the same standing tile rerenders", async () => {
  const MahjongStandingTile = await loadStandingTile();
  const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
  const animate = vi.fn();
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });

  try {
    const view = render(<MahjongStandingTile />);
    const tile = view.container.querySelector("i.mahjong-standing-tile");
    view.rerender(<MahjongStandingTile />);

    expect(view.container.querySelector("i.mahjong-standing-tile")).toBe(tile);
    expect(animate).not.toHaveBeenCalled();
  } finally {
    if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
    else Reflect.deleteProperty(Element.prototype, "animate");
  }
});
