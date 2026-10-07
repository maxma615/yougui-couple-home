// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { northReplacementFixture } from "../fixtures/mahjong-view-game";
import type { Choice, GameView, RoomView } from "@/modules/mahjong/types";
import type { DiscardMotionIntent } from "@/components/mahjong/discard-motion";

const browserDescriptors = [
  [window, "matchMedia"], [Element.prototype, "animate"], [Element.prototype, "getBoundingClientRect"], [document, "elementFromPoint"],
].map(([target, key]) => ({ target: target as object, key: key as string, descriptor: Object.getOwnPropertyDescriptor(target as object, key as string) }));

afterEach(() => {
  cleanup();
  document.querySelectorAll("style[data-motion-paint-fixture]").forEach(style => style.remove());
  vi.useRealTimers();
  for (const { target, key, descriptor } of browserDescriptors) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

function room(game: GameView, version = 10): RoomView {
  return {
    id: "room-a", code: "ABCDEFGH", hostUserId: "human", mode: "east", variant: "sanma", status: "playing", version, mySeat: 0,
    members: [0, 1, 2].map(seat => ({ userId: seat ? `bot:${seat}` : "human", kind: seat ? "bot" : "human", displayName: `玩家${seat}`, seat, ready: true, connected: true })),
    game,
  };
}

function gameView(overrides: Partial<GameView> = {}) {
  const view = northReplacementFixture().view(0);
  view.gameInstanceId = "game-a";
  view.handId = 4;
  view.decisionId = "opaque-decision-a";
  view.hand = ["p1", "p1", "p2"];
  view.drawnTile = null;
  view.turnSeat = 0;
  view.choices = [{ id: "discard:p1", type: "discard", value: "p1" }];
  return { ...view, ...overrides };
}

function rect(element: Element, value: { left: number; top: number; width: number; height: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ ...value, x: value.left, y: value.top, right: value.left + value.width, bottom: value.top + value.height, toJSON: () => value }),
  });
}

function prepareMotionPrimitives() {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      if (this.matches?.(".mahjong-tile") && this.closest(".mahjong-river__tile")) {
        const value = { left: 320, top: 240, width: 24, height: 34 };
        return { ...value, x: value.left, y: value.top, right: value.left + value.width, bottom: value.top + value.height, toJSON: () => value };
      }
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
    },
  });
  const animation = { cancel: vi.fn(), onfinish: null, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn(() => animation) });
  return animation;
}

it("waits for the accepted snapshot and flies from the exact selected copy of a repeated tile", () => {
  prepareMotionPrimitives();
  const beforeGame = gameView(), before = room(beforeGame);
  const afterGame = structuredClone(beforeGame);
  afterGame.decisionId = "opaque-decision-b";
  afterGame.turnSeat = 1;
  afterGame.players[0].discards = ["p1"];
  const after = room(afterGame, 11);
  const onChoice = vi.fn((_choice: Choice, _intent?: DiscardMotionIntent | null) => {});
  const props = { busy: false, host: true, ownSeat: 0, connected: true, onChoice, onFinish: () => {}, onRematch: () => {}, onLeave: () => {} };
  const view = render(<GameRoom room={before} {...props}/>);
  const copies = screen.getAllByRole("button", { name: "切出 一筒" });
  rect(copies[0], { left: 80, top: 400, width: 44, height: 62 });
  rect(copies[1], { left: 160, top: 410, width: 44, height: 62 });
  const paintStyle = document.createElement("style");
  paintStyle.dataset.motionPaintFixture = "true";
  paintStyle.textContent = ".mahjong-hand .mahjong-tile.is-selected {padding:2px 3px;border-top-left-radius:4px;outline:2px solid rgb(240,196,109);outline-offset:2px;}";
  document.head.append(paintStyle);

  fireEvent.click(copies[0]);
  fireEvent.click(copies[1]);
  fireEvent.click(copies[1]);
  expect(onChoice).toHaveBeenCalledOnce();
  const selectedIntent = onChoice.mock.calls[0][1];
  expect(onChoice).toHaveBeenCalledWith(expect.objectContaining({ id: "discard:p1" }), expect.objectContaining({
    sourceTileId: "hand:1:p1",
    sourceRect: { left: 160, top: 410, width: 44, height: 62 },
    sourceGeometry: { width: 44, height: 62, angle: 0, scale: 1 },
    roomVersion: 10,
    decisionId: "opaque-decision-a",
  }));
  expect(selectedIntent?.sourcePaint).toEqual(expect.objectContaining({ padding: "2px 3px", borderRadius: "4px", outlineOffset: "2px" }));
  expect(screen.queryByTestId("mahjong-discard-flight")).toBeNull();

  view.rerender(<GameRoom room={after} {...props} motionCanAnimate motionIntent={selectedIntent}/>);
  const flight = screen.getByTestId("mahjong-discard-flight");
  const materialCall = vi.mocked(Element.prototype.animate).mock.calls.find(([frames]) => Array.isArray(frames) && (frames[0] as Keyframe)?.padding === "2px 3px");
  expect(materialCall?.[0]).toEqual([selectedIntent?.sourcePaint, expect.objectContaining({ padding: expect.any(String) })]);
  expect(materialCall?.[1]).toEqual(expect.objectContaining({ duration: 230, fill: "both" }));
  expect(flight).toHaveAttribute("data-motion-source", "own");
  expect(flight).toHaveAttribute("data-motion-seat", "0");
  expect(flight).toHaveAttribute("data-motion-event", "discard:room-a:game-a:4:0:0");
  expect(flight).toHaveAttribute("data-motion-source-tile-id", "hand:1:p1");
  expect((flight as HTMLElement).style.left).toBe("182px");
  expect((flight as HTMLElement).style.top).toBe("441px");
  expect(document.querySelector('[data-discard-event-id="discard:room-a:game-a:4:0:0"]'))
    .toHaveClass("is-discard-motion-hidden");

  view.rerender(<GameRoom room={{ ...after }} {...props} motionCanAnimate={false} motionIntent={null}/>);
  expect(screen.getByTestId("mahjong-discard-flight")).toBeInTheDocument();
  expect(document.querySelector('[data-discard-event-id="discard:room-a:game-a:4:0:0"]'))
    .toHaveClass("is-discard-motion-hidden");
});

it("flies opponents from a public facedown rack and never reads their concealed face", () => {
  prepareMotionPrimitives();
  const beforeGame = gameView({ choices: [], turnSeat: 2 });
  beforeGame.players[2].handCount = 4;
  const before = room(beforeGame);
  const afterGame = structuredClone(beforeGame);
  afterGame.decisionId = "opaque-decision-b";
  afterGame.turnSeat = 1;
  afterGame.players[2].handCount = 3;
  afterGame.players[2].discards = ["s4"];
  const after = room(afterGame, 11);
  const view = render(<GameRoom room={before} busy={false} host ownSeat={0} connected onChoice={() => {}} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
  const oldBack = document.querySelector('[data-testid="player-2"] .mahjong-player__hidden > i')!;
  rect(oldBack, { left: 100, top: 400, width: 8, height: 12 });
  const visibleBack = oldBack.querySelector('[data-motion-surface]')!;
  rect(visibleBack, { left: 680, top: 180, width: 28, height: 36 });
  view.rerender(<GameRoom room={{ ...before }} busy={false} host ownSeat={0} connected onChoice={() => {}} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);

  view.rerender(<GameRoom room={after} busy={false} host ownSeat={0} connected onChoice={() => {}} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
  const flight = screen.getByTestId("mahjong-discard-flight");
  expect(flight).toHaveAttribute("data-motion-source", "opponent");
  expect(flight).toHaveAttribute("data-motion-seat", "2");
  expect(flight).toHaveStyle({ left: "694px", top: "198px", width: "28px", height: "36px" });
  expect(flight.querySelector(".mahjong-discard-flight__back")).toBeInTheDocument();
  expect(flight.textContent).not.toContain("p1");
});

it("closes and disables stale reaction choices when the socket disconnects", () => {
  const beforeGame = gameView({
    choices: [
      { id: "pon:m3", type: "pon", value: "m3" },
      { id: "pon:p3", type: "pon", value: "p3" },
    ],
  });
  const before = room(beforeGame);
  const onChoice = vi.fn();
  const view = render(<GameRoom room={before} busy={false} host ownSeat={0} connected onChoice={onChoice} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);

  fireEvent.click(screen.getByRole("button", { name: "碰" }));
  expect(document.querySelector(".mahjong-call-dialog")).toBeInTheDocument();
  view.rerender(<GameRoom room={before} busy={false} host ownSeat={0} connected={false} onChoice={onChoice} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);

  expect(document.querySelector(".mahjong-call-dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "碰" })).toBeDisabled();
  expect(onChoice).not.toHaveBeenCalled();
});

it("does not use a pending hand origin after the table geometry was invalidated", () => {
  prepareMotionPrimitives();
  const beforeGame = gameView(), before = room(beforeGame);
  const afterGame = structuredClone(beforeGame);
  afterGame.decisionId = "opaque-decision-b";
  afterGame.players[0].discards = ["p1"];
  const after = room(afterGame, 11);
  const onChoice = vi.fn((_choice: Choice, _intent?: DiscardMotionIntent | null) => {});
  const view = render(<GameRoom room={before} busy={false} host ownSeat={0} connected onChoice={onChoice} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
  const tile = screen.getAllByRole("button", { name: "切出 一筒" })[1];
  rect(tile, { left: 160, top: 410, width: 44, height: 62 });
  fireEvent.click(tile);
  fireEvent.click(tile);
  const intent = onChoice.mock.calls[0][1];
  expect(intent).toBeTruthy();

  fireEvent.resize(window);
  view.rerender(<GameRoom room={after} busy={false} host ownSeat={0} connected motionCanAnimate motionIntent={intent} onChoice={onChoice} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);

  expect(screen.queryByTestId("mahjong-discard-flight")).toBeNull();
  expect(document.querySelector('[data-discard-event-id="discard:room-a:game-a:4:0:0"]'))
    .not.toHaveClass("is-discard-motion-hidden");
});

it("applies a received discard immediately without a flight when reduced motion is enabled", () => {
  prepareMotionPrimitives();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  const beforeGame = gameView({ choices: [], turnSeat: 2 }), before = room(beforeGame);
  const afterGame = structuredClone(beforeGame);
  afterGame.players[2].discards = ["s4"];
  afterGame.turnSeat = 1;
  const view = render(<GameRoom room={before} busy={false} host ownSeat={0} connected onChoice={() => {}} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);

  view.rerender(<GameRoom room={room(afterGame, 11)} busy={false} host ownSeat={0} connected onChoice={() => {}} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
  expect(screen.queryByTestId("mahjong-discard-flight")).toBeNull();
  expect(document.querySelector('[data-discard-event-id="discard:room-a:game-a:4:2:0"] .mahjong-tile')).toBeInTheDocument();
});
