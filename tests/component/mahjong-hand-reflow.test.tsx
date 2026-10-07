// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useHandReflow } from "@/components/mahjong/use-hand-reflow";
import type { DiscardMotionIntent } from "@/components/mahjong/discard-motion";
import type { GameView, RoomView } from "@/modules/mahjong/types";

type AnimationRecord = { target: Element; frames: Keyframe[]; options: KeyframeAnimationOptions; animation: any };
const animations: AnimationRecord[] = [];
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
let reducedMotion = false;
const sourceOffsets = new Map<string, number>();

const browserDescriptors = [
  [window, "matchMedia"], [Element.prototype, "animate"], [Element.prototype, "getBoundingClientRect"], [document, "visibilityState"],
].map(([target, key]) => ({ target: target as object, key: key as string, descriptor: Object.getOwnPropertyDescriptor(target as object, key as string) }));

afterEach(() => {
  cleanup();
  animations.length = 0;
  sourceOffsets.clear();
  mediaListeners.clear();
  reducedMotion = false;
  for (const { target, key, descriptor } of browserDescriptors) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

function fixture(version = 10, decisionId = "decision-a", hand = ["p0", "p5", "p5", "p2", "p5"], drawnTile: string | null = "p5"): RoomView {
  return {
    id: "room-a", code: "ABCDEFGH", hostUserId: "user-0", mode: "east", variant: "yonma", status: "playing", version, mySeat: 0,
    members: [],
    game: {
      gameInstanceId: "game-a", handId: 4, decisionId, phase: "zimo", turnSeat: 0, roundWind: 0, roundNumber: 1, honba: 0,
      riichiSticks: 0, remainingTiles: 60, doraIndicators: [], hand, drawnTile,
      players: [{ seat: 0, wind: 0, score: 25000, handCount: hand.length, discards: version > 10 ? ["p5"] : [], melds: [], riichi: false }],
      choices: [{ id: "discard:p5", type: "discard", value: "p5" }], settlement: null, ranking: null,
    } as GameView,
  } as RoomView;
}

function intent(overrides: Partial<DiscardMotionIntent> = {}): DiscardMotionIntent {
  return {
    roomId: "room-a", roomVersion: 10, gameInstanceId: "game-a", handId: 4, decisionId: "decision-a", seat: 0,
    choiceId: "discard:p5", tileValue: "p5", sourceTileId: "hand:1:p5",
    sourceRect: { left: 50, top: 100, width: 40, height: 60 }, sourceGeometry: { width: 40, height: 60, angle: 0, scale: 1 },
    environmentEpoch: 0, ...overrides,
  };
}

function preparePrimitives() {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    get matches() { return reducedMotion; },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.delete(listener),
  }) });
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation: any = { id: "", onfinish: null, cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    animations.push({ target: this, frames, options, animation });
    return animation;
  } });
  Object.defineProperty(Element.prototype, "getBoundingClientRect", { configurable: true, value(this: HTMLElement) {
    const id = this.dataset.handInstanceId || "";
    const version = Number(this.closest("[data-room-version]")?.getAttribute("data-room-version") || 10);
    const index = Number(id.match(/^hand:(\d+):/)?.[1] || 0);
    const x = (id.startsWith("drawn:") ? (version === 10 ? 600 : 200) : index * 50) + (sourceOffsets.get(id) ?? 0);
    const rect = { x, y: 100, left: x, top: 100, right: x + 40, bottom: 160, width: 40, height: 60, toJSON: () => ({}) };
    return rect as DOMRect;
  } });
}

function HandHarness({ room, connected = true, canAnimate = false, motionIntent = null }: {
  room: RoomView; connected?: boolean; canAnimate?: boolean; motionIntent?: DiscardMotionIntent | null;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const reflow = useHandReflow({ room, ownSeat: 0, connected, canAnimate, intent: motionIntent, tableRef });
  const game = room.game!;
  const closed = game.drawnTile && game.hand.at(-1) === game.drawnTile ? game.hand.slice(0, -1) : game.hand;
  return <section ref={tableRef} data-room-version={room.version}>
    <div className="mahjong-hand" data-testid="hand">
      {closed.map((face, index) => <button type="button" key={`hand:${index}:${face}`} data-hand-instance-id={`hand:${index}:${face}`} data-tile-face={face} onPointerDown={reflow.captureBeforeInput}/>) }
      {game.drawnTile ? <span><button type="button" data-hand-instance-id={`drawn:${game.decisionId}:${game.drawnTile}`} data-tile-face={game.drawnTile} onPointerDown={reflow.captureBeforeInput}/></span> : null}
    </div>
  </section>;
}

function acceptedRoom() {
  const before = fixture();
  const after = fixture(11, "decision-b", ["p0", "p5", "p2", "p5"], null);
  after.game!.players[0].discards = ["p5"];
  return { before, after };
}

function startAccepted() {
  preparePrimitives();
  const { before, after } = acceptedRoom();
  const view = render(<HandHarness room={before}/>);
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);
  return { view, before, after };
}

it("animates only actual moved occurrences and preserves an ongoing move on a quiet refresh", () => {
  const { view, after } = startAccepted();
  const reflows = animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:"));
  expect(reflows).toHaveLength(3);
  expect(reflows.map(record => record.animation.id)).toEqual(expect.arrayContaining([
    "mahjong-hand-reflow:hand%3A2%3Ap5", "mahjong-hand-reflow:hand%3A3%3Ap2", "mahjong-hand-reflow:drawn%3Adecision-a%3Ap5",
  ]));
  expect(reflows.every(record => record.options.duration === 250 && record.options.fill === "both")).toBe(true);

  const quiet = { ...after, version: after.version + 1 };
  view.rerender(<HandHarness room={quiet} canAnimate motionIntent={intent()}/>);
  expect(reflows.every(record => record.animation.cancel.mock.calls.length === 0)).toBe(true);
  expect(reflows.every(record => (record.target as HTMLElement).style.transition === "none")).toBe(true);
  for (const record of reflows) record.animation.onfinish?.();
  expect(reflows.every(record => (record.target as HTMLElement).style.transition === "")).toBe(true);
});

it("uses the measured hand geometry from real input across local selection renders", () => {
  preparePrimitives();
  const { before, after } = acceptedRoom();
  const view = render(<HandHarness room={before}/>);
  sourceOffsets.set("hand:2:p5", 40);
  fireEvent.pointerDown(document.querySelector('[data-hand-instance-id="hand:2:p5"]')!);
  sourceOffsets.clear();
  view.rerender(<HandHarness room={before}/>);
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);

  const moved = animations.find(record => record.animation.id === "mahjong-hand-reflow:hand%3A2%3Ap5");
  expect(moved).toBeDefined();
  expect(moved!.frames[0]).toMatchObject({ translate: "90px 0px" });
});

it("cancels at the first real hand pointer input and on the next engine decision", () => {
  const { view, after } = startAccepted();
  const reflows = animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:"));
  fireEvent.pointerDown(screen.getAllByRole("button")[1]);
  expect(reflows.every(record => record.animation.cancel.mock.calls.length === 1)).toBe(true);

  const nextDraw = fixture(12, "decision-c", [...after.game!.hand, "z3"], "z3");
  nextDraw.game!.players[0].discards = ["p5"];
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);
  const restarted = animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:"));
  view.rerender(<HandHarness room={nextDraw} canAnimate motionIntent={intent()}/>);
  expect(restarted.every(record => record.animation.cancel.mock.calls.length === 1)).toBe(true);
});

it("does not replay an initial or reconnect snapshot and suppresses reduced-motion acceptance", () => {
  preparePrimitives();
  const { before, after } = acceptedRoom();
  const view = render(<HandHarness room={after} connected={false} canAnimate motionIntent={intent()}/>);
  view.rerender(<HandHarness room={after} connected canAnimate motionIntent={intent()}/>);
  expect(animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:"))).toHaveLength(0);

  view.rerender(<HandHarness room={before}/>);
  reducedMotion = true;
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);
  expect(animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:"))).toHaveLength(0);
});

it("cancels active motion on resize, hidden visibility, connection loss, and a new hand scope", () => {
  preparePrimitives();
  const { before, after } = acceptedRoom();
  const view = render(<HandHarness room={before}/>);
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);
  const first = animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:"));
  fireEvent(window, new Event("resize"));
  expect(first.every(record => record.animation.cancel.mock.calls.length === 1)).toBe(true);

  view.rerender(<HandHarness room={before}/>);
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);
  const second = animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:")).slice(first.length);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  fireEvent(document, new Event("visibilitychange"));
  expect(second.every(record => record.animation.cancel.mock.calls.length === 1)).toBe(true);

  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  view.rerender(<HandHarness room={before}/>);
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);
  const third = animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:")).slice(first.length + second.length);
  view.rerender(<HandHarness room={after} connected={false} canAnimate motionIntent={intent()}/>);
  expect(third.every(record => record.animation.cancel.mock.calls.length === 1)).toBe(true);

  view.rerender(<HandHarness room={before}/>);
  view.rerender(<HandHarness room={after} canAnimate motionIntent={intent()}/>);
  const fourth = animations.filter(record => record.animation.id.startsWith("mahjong-hand-reflow:")).slice(first.length + second.length + third.length);
  const newScope = { ...after, id: "room-b", game: { ...after.game!, gameInstanceId: "game-b" } } as RoomView;
  view.rerender(<HandHarness room={newScope} canAnimate motionIntent={intent()}/>);
  expect(fourth.every(record => record.animation.cancel.mock.calls.length === 1)).toBe(true);
});
