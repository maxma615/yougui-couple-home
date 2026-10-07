// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { northReplacementFixture } from "../fixtures/mahjong-view-game";
import type { GameView, RoomView } from "@/modules/mahjong/types";

const browserDescriptors = [
  [window, "matchMedia"], [Element.prototype, "animate"], [Element.prototype, "getBoundingClientRect"],
].map(([target, key]) => ({ target:target as object, key:key as string, descriptor:Object.getOwnPropertyDescriptor(target as object,key as string) }));

afterEach(() => {
  cleanup();
  for (const { target, key, descriptor } of browserDescriptors) {
    if (descriptor) Object.defineProperty(target,key,descriptor);
    else Reflect.deleteProperty(target,key);
  }
});

function room(game: GameView, version = 10): RoomView {
  return {
    id:"solid-flight-room", code:"ABCDEFGH", hostUserId:"human", mode:"east", variant:"sanma", status:"playing", version, mySeat:0,
    members:[0,1,2].map(seat => ({ userId:seat ? `bot:${seat}` : "human", kind:seat ? "bot" : "human",
      displayName:`玩家${seat}`, seat, ready:true, connected:true })), game,
  };
}

function gameView(overrides: Partial<GameView> = {}) {
  const view = northReplacementFixture().view(0);
  view.gameInstanceId = "solid-flight-game";
  view.handId = 1;
  view.decisionId = "solid-flight-decision-a";
  view.hand = ["p1","p2"];
  view.drawnTile = null;
  view.turnSeat = 0;
  view.choices = [];
  return { ...view, ...overrides };
}

function rect(element: Element, value: { left:number; top:number; width:number; height:number }) {
  Object.defineProperty(element,"getBoundingClientRect",{
    configurable:true,
    value:() => ({ ...value, x:value.left, y:value.top, right:value.left+value.width, bottom:value.top+value.height, toJSON:() => value }),
  });
}

function prepareMotionPrimitives() {
  Object.defineProperty(window,"matchMedia",{ configurable:true, value:() => ({ matches:false, addEventListener(){}, removeEventListener(){} }) });
  Object.defineProperty(Element.prototype,"getBoundingClientRect",{
    configurable:true,
    value(this: HTMLElement) {
      if (this.matches?.(".mahjong-tile") && this.closest(".mahjong-river__tile")) {
        const value = { left:320, top:240, width:24, height:34 };
        return { ...value, x:value.left, y:value.top, right:value.left+value.width, bottom:value.top+value.height, toJSON:() => value };
      }
      return { x:0, y:0, left:0, top:0, right:0, bottom:0, width:0, height:0, toJSON:() => ({}) };
    },
  });
  Object.defineProperty(Element.prototype,"animate",{ configurable:true, value:vi.fn(() => ({ cancel:vi.fn(), onfinish:null })) });
}

it("renders an opponent discard as one public six-face tile volume", () => {
  prepareMotionPrimitives();
  const beforeGame = gameView({ turnSeat:2 });
  beforeGame.players[2].handCount = 4;
  const before = room(beforeGame);
  const afterGame = structuredClone(beforeGame);
  afterGame.decisionId = "solid-flight-decision-b";
  afterGame.turnSeat = 1;
  afterGame.players[2].handCount = 3;
  afterGame.players[2].discards = ["s4"];
  const after = room(afterGame,11);
  const props = { busy:false, host:true, ownSeat:0, connected:true, onChoice:()=>{}, onFinish:()=>{}, onRematch:()=>{}, onLeave:()=>{} };
  const view = render(<GameRoom room={before} {...props}/>);
  const rackTile = document.querySelector('[data-testid="player-2"] .mahjong-player__hidden > i')!;
  rect(rackTile,{ left:100, top:400, width:8, height:12 });
  rect(rackTile.querySelector("[data-motion-surface]")!,{ left:680, top:180, width:28, height:36 });
  view.rerender(<GameRoom room={{ ...before }} {...props}/>);
  view.rerender(<GameRoom room={after} {...props}/>);

  const flight = screen.getByTestId("mahjong-discard-flight");
  const faces = [...flight.querySelectorAll<HTMLElement>("[data-flight-face]")];
  expect(faces.map(face => face.dataset.flightFace).sort()).toEqual(["back","bottom","front","left","right","top"]);
  expect(flight).toHaveAttribute("aria-hidden","true");
  expect(flight.querySelector('[data-flight-face="front"] [data-tile-face]')).toHaveAttribute("data-tile-face","s4");
  expect(faces.every(face => face.getAttribute("aria-hidden") === "true")).toBe(true);
  expect(flight.textContent).not.toContain("p1");
});
