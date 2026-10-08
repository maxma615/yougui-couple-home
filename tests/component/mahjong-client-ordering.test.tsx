// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { MahjongResponse } from "@/modules/mahjong/types";

const mocks = vi.hoisted(() => ({ api: vi.fn(), io: vi.fn(), session: { session: { user: { id: "human", role: "member" } }, loading: false, error: null, refreshSession: vi.fn() } }));
vi.mock("@/components/api-client", () => ({ apiRequest: mocks.api, errorMessage: (error: Error) => error.message }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => mocks.session, SessionProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("socket.io-client", () => ({ io: mocks.io }));
import { MahjongClient } from "@/components/mahjong/mahjong-client";

const empty: MahjongResponse = { room: null, serviceRunning: true };
function table(id: string, version = 1, ready = false): MahjongResponse {
  return { room: { id, code: id.toUpperCase().repeat(8), hostUserId: "human", variant: "sanma", mode: "east", status: "lobby", version, mySeat: 0, members: [{ userId: "human", displayName: "Player", kind: "human", seat: 0, ready, connected: true }], game: null }, serviceRunning: true };
}
function deferred() { let resolve!: (state: MahjongResponse) => void; const promise = new Promise<MahjongResponse>(r => { resolve = r; }); return { promise, resolve }; }
class DeliveredSocket {
  callbacks = new Map<string, ((payload?: unknown) => void)[]>();
  connected = false;
  disconnect = vi.fn();
  on(event: string, callback: (payload?: unknown) => void) { this.callbacks.set(event, [...this.callbacks.get(event) || [], callback]); return this; }
  // Deliberately deliver callbacks even after disconnect, as an already queued transport callback can.
  deliver(event: string, payload?: unknown) { if(event==="connect")this.connected=true; if(event==="disconnect"||event==="connect_error")this.connected=false; for (const callback of this.callbacks.get(event) || []) callback(payload); }
}
let server: MahjongResponse, nextGet: ReturnType<typeof deferred> | undefined, nextPost: ReturnType<typeof deferred> | undefined;
let sockets: DeliveredSocket[];
beforeEach(() => {
  server = table("a", 8); nextGet = undefined; nextPost = undefined; sockets = [];
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function() { this.open = false; } });
  mocks.io.mockReset().mockImplementation(() => { const socket = new DeliveredSocket(); sockets.push(socket); return socket; });
  mocks.api.mockReset().mockImplementation((_url: string, options: RequestInit) => {
    if (options.method === "GET") { const held = nextGet; nextGet = undefined; return held?.promise || Promise.resolve(server); }
    const held = nextPost; nextPost = undefined;
    const action = JSON.parse(options.body as string).action;
    if (action === "finish") server = empty;
    if (action === "create") server = table("b");
    if (action === "ready") server = table("a", 9, true);
    return held?.promise || Promise.resolve(server);
  });
});
afterEach(cleanup);
async function start(state = table("a", 8)) { server = state; render(<MahjongClient/>); if (state.room?.status==='playing') await screen.findByTestId('mahjong-board'); else if (state.room) await screen.findByText(state.room.code); else await screen.findByRole("button", { name: "创建东风牌桌" }); }
function holdRefresh() { const held = deferred(); nextGet = held; fireEvent(window, new Event("online")); return held; }
async function deliver(held: ReturnType<typeof deferred>, state: MahjongResponse) { await act(async () => held.resolve(state)); }
async function socketState(state: MahjongResponse, socket = sockets.at(-1)!) { server = state; await act(async () => { if(!socket.connected)socket.deliver("connect"); socket.deliver("mahjong:state", state); }); }
function beginFinish() { fireEvent.click(screen.getByRole("button", { name: "解散牌桌" })); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "解散牌桌" })); }
async function finish() { beginFinish(); await screen.findByRole("button", { name: "创建东风牌桌" }); }
async function create() { fireEvent.click(screen.getByRole("button", { name: "创建东风牌桌" })); await screen.findByText("BBBBBBBB"); }
function expectRoom(id: string) { expect(screen.getByTestId("mahjong-room-code").textContent).toBe(id.toUpperCase().repeat(8)); }

it("keeps a finished room dissolved when its pre-Finish GET arrives late", async () => {
  await start(); const held = holdRefresh(); await finish(); await deliver(held, table("a", 8));
  expect(server.room).toBeNull(); expect(screen.queryByTestId("mahjong-room-code")).toBeNull(); expect(screen.getByRole("button", { name: "创建东风牌桌" })).toBeTruthy();
});
it("keeps replacement B when a pre-Finish A GET arrives after Create", async () => {
  await start(); const held = holdRefresh(); await finish(); await create(); await deliver(held, table("a", 8));
  expectRoom("b"); expect(server.room!.id).toBe("b");
});
it("keeps new B when a pre-Create null GET arrives late", async () => {
  await start(); await finish(); const held = holdRefresh(); await create(); await deliver(held, empty); expectRoom("b");
});
it("accepts other-tab leave/join including return to an earlier room ID and invalidates pending snapshots", async () => {
  await start(); const heldA = holdRefresh(); await socketState(empty); await deliver(heldA, table("a", 8));
  expect(screen.queryByTestId("mahjong-room-code")).toBeNull();
  const heldNull = holdRefresh(); await socketState(table("b", 2)); await deliver(heldNull, empty); expectRoom("b");
  await socketState(empty); await socketState(table("a", 10)); expectRoom("a");
});
it("retires queued state/connect/error/disconnect callbacks from the replaced socket", async () => {
  await start(); const old = sockets.at(-1)!; await finish(); await create();
  const current = sockets.at(-1)!; await act(async () => current.deliver("connect")); await socketState(table("b"),current);
  const requestsBefore = mocks.api.mock.calls.length;
  await act(async () => { old.deliver("mahjong:state", table("a", 99)); old.deliver("mahjong:error", { message: "retired error" }); old.deliver("connect"); old.deliver("disconnect"); old.deliver("connect_error"); });
  expectRoom("b"); expect(screen.queryByText("retired error")).toBeNull(); expect(mocks.api.mock.calls.length).toBe(requestsBefore);
  expect(screen.getByRole("status").textContent).toBe("实时同步"); expect(old.disconnect).toHaveBeenCalled();
});
it("keeps the newer socket room when an earlier Create POST for another room resolves", async () => {
  await start(empty); const post = deferred(); nextPost = post;
  fireEvent.click(screen.getByRole("button", { name: "创建东风牌桌" }));
  await socketState(table("c", 4)); const reconciliation = deferred(); nextGet = reconciliation;
  await deliver(post, table("b", 1)); expectRoom("c"); await deliver(reconciliation, table("c", 4)); expectRoom("c");
});
it("keeps a socket replacement when an earlier Finish POST resolves null", async () => {
  await start(); const post = deferred(); nextPost = post; beginFinish();
  await socketState(table("b", 4)); const reconciliation = deferred(); nextGet = reconciliation;
  await deliver(post, empty); expectRoom("b"); await deliver(reconciliation, table("b", 4)); expectRoom("b");
});
it("reconciles a POST whose pending time included an unrelated socket snapshot", async () => {
  await start(empty); const post = deferred(); nextPost = post;
  fireEvent.click(screen.getByRole("button", { name: "创建东风牌桌" }));
  await socketState(empty); server = table("b", 1); await deliver(post, table("b", 1)); await screen.findByText("BBBBBBBB");
});
it("does not apply a GET started during a pending mutation or hide its eventual result", async () => {
  await start(); const post = deferred(); nextPost = post; beginFinish(); const held = holdRefresh();
  await deliver(held, table("b", 3)); expectRoom("a");
  server = empty; await deliver(post, empty); expect(screen.queryByTestId("mahjong-room-code")).toBeNull();
});
it("rejects older same-room versions from both GET and POST after a newer socket update", async () => {
  await start(); const get = holdRefresh(); const post = deferred(); nextPost = post;
  fireEvent.click(screen.getByRole("button", { name: "准备好了" }));
  await socketState(table("a", 11, true)); await deliver(post, table("a", 9, false)); await deliver(get, table("a", 8, false));
  expectRoom("a"); expect(screen.getByRole("button", { name: "已准备 · 点击取消" })).toBeTruthy();
});
it("accepts a same-ID other-tab rematch while refusing its old finished snapshot", async () => {
  await start(); const finished = table("a", 20);
  finished.room!.status = "finished";
  finished.room!.game = { decisionId: "done", phase: "jieju", roundWind: 0, roundNumber: 3, honba: 0, riichiSticks: 0, remainingTiles: 0, doraIndicators: [], turnSeat: 0, hand: [], drawnTile: null, players: [0, 1, 2].map(seat => ({ seat, wind: seat, score: 35000, handCount: 0, discards: [], melds: [], riichi: false, nuki: 0 })), choices: [], settlement: null, ranking: [0, 1, 2].map(seat => ({ seat, rank: seat + 1, score: 35000 })) };
  await socketState(finished); expect(screen.getByLabelText("最终名次")).toBeTruthy();
  const held = holdRefresh(); await socketState(table("a", 21)); await deliver(held, finished);
  expectRoom("a"); expect(screen.queryByLabelText("最终名次")).toBeNull(); expect(screen.getByRole("button", { name: "准备好了" })).toBeTruthy();
});
it("accepts a fresh authoritative GET transition when another tab changed rooms without a socket", async () => {
  await start(); server = table("b", 5); fireEvent(window, new Event("online")); await screen.findByText("BBBBBBBB");
  server = empty; fireEvent(window, new Event("online")); await screen.findByRole("button", { name: "创建东风牌桌" });
});

it("ignores an earlier overlapping GET even when it arrives before the latest GET", async () => {
  await start(); const older = holdRefresh(), latest = holdRefresh();
  await deliver(older, table("b", 50)); expectRoom("a");
  await deliver(latest, table("c", 2)); expectRoom("c");
});

import {physicalEngine} from '../fixtures/mahjong-settlement-game';
function playing(version=8):MahjongResponse{
 const game=physicalEngine('sanma',{0:'p123456789s123z2'},'z2');
 const r=table('a',version);r.room!.status='playing';r.room!.game=game.view(0);return r;
}
it('keeps old hand actions disabled after transport connect until an accepted room snapshot arrives',async()=>{
 const current=playing();await start(current);const socket=sockets.at(-1)!;
 await socketState(current,socket);
 await act(async()=>socket.deliver('disconnect'));
 const held=deferred();nextGet=held;
 await act(async()=>socket.deliver('connect'));
 expect(screen.getByRole('status',{name:'连接状态'}).textContent).toContain('正在重连');
 const tile=document.querySelector<HTMLButtonElement>('.mahjong-hand [data-choice-type="discard"]')!;expect(tile.disabled).toBe(true);
 const before=mocks.api.mock.calls.filter(([,o])=>o.method==='POST').length;
 fireEvent.click(tile);fireEvent.click(tile);expect(mocks.api.mock.calls.filter(([,o])=>o.method==='POST')).toHaveLength(before);
 await socketState({...current,room:{...current.room!,version:7}},socket);
 expect(tile.disabled).toBe(true);expect(screen.getByRole('status',{name:'连接状态'})).toBeTruthy();
 await socketState({...current,room:{...current.room!,version:9}},socket);
 expect(document.querySelector<HTMLButtonElement>('.mahjong-hand [data-choice-type="discard"]')!.disabled).toBe(false);
 await deliver(held,{...current,room:{...current.room!,version:8}});
 expect(screen.queryByRole('status',{name:'连接状态'})).toBeNull();
});
it('ignores queued room frames after disconnect until the same transport reconnects',async()=>{
 const current=playing();await start(current);const socket=sockets.at(-1)!;await socketState(current,socket);
 await act(async()=>socket.deliver('disconnect'));
 await act(async()=>socket.deliver('mahjong:state',{...current,room:{...current.room!,version:9}}));
 expect(screen.getByRole('status',{name:'连接状态'})).toBeTruthy();
 expect(document.querySelector<HTMLButtonElement>('.mahjong-hand [data-choice-type="discard"]')!.disabled).toBe(true);
 await act(async()=>socket.deliver('connect'));
 await socketState({...current,room:{...current.room!,version:10}},socket);
 expect(screen.queryByRole('status',{name:'连接状态'})).toBeNull();
 expect(document.querySelector<HTMLButtonElement>('.mahjong-hand [data-choice-type="discard"]')!.disabled).toBe(false);
});
