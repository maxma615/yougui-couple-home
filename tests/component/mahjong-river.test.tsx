// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { RiichiGame } from "@/modules/mahjong/engine";
import type { RoomView } from "@/modules/mahjong/types";

afterEach(cleanup);
function show(discards: string[]) {
  const game = new RiichiGame("east", ["A", "B", "C", "D"], { dealer: 0 }).view(0);
  game.players[0].discards = discards;
  game.players[0].riichi = discards.some(tile => tile.includes("*"));
  game.choices = [];
  const room: RoomView = {id:"river-fixture",code:"RIVERABC",hostUserId:"A",variant:"yonma",mode:"east",status:"playing",version:1,mySeat:0,members:[0,1,2,3].map(seat=>({userId:String(seat),displayName:"ABCD"[seat],kind:"human",seat,ready:true,connected:true})),game};
  render(<GameRoom room={room} busy={false} host ownSeat={0} connected onChoice={()=>{}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
  return screen.getByTestId("river-0");
}
it("removes a claimed discard face from the visible river without changing its original event index", () => {
  const river=show(["m1","p5+","s9","z1"]);
  expect([...river.querySelectorAll('[data-tile-face]')].map(e=>e.getAttribute('data-tile-face'))).toEqual(["m1","s9","z1"]);
  expect([...river.querySelectorAll('[data-river-index]')].map(e=>e.getAttribute('data-river-index'))).toEqual(["0","2","3"]);
});
it("carries the riichi sideways position to the next visible discard when the declaration tile was claimed", () => {
  const river=show(["m1","p5*+","s9_","z1"]);
  const sideways=river.querySelectorAll('.mahjong-river__tile.is-riichi');
  expect(sideways).toHaveLength(1);
  expect(sideways[0].getAttribute('data-tile')).toBe('s9');
  expect(sideways[0].classList.contains('is-tsumogiri')).toBe(true);
  expect(river.querySelector('[data-tile="p5"]')).toBeNull();
});
it("lays out six visible tiles per row, with called tiles excluded from row counting", () => {
  const river=show(["m1","m2","m3","m4","m5","p1-","m6","m7","m8","m9","p2","p3","p4","p5","p6","p7","p8","p9","s1","s2","s3"]);
  const rows=[...river.querySelectorAll('[data-river-row]')];
  expect(rows.map(e=>e.querySelectorAll('[data-tile-face]').length)).toEqual([6,6,6,2]);
  expect(rows[0].querySelector('[data-tile="m6"]')).not.toBeNull();
  expect(rows[1].querySelector('[data-tile="m7"]')).not.toBeNull();
});
