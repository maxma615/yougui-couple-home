import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomStore } from "@/modules/mahjong/rooms";
import type { MahjongCommand } from "@/modules/mahjong/types";
const players = [0,1,2,3,4].map(n => ({ userId: randomUUID(), displayName: `player${n}` }));
type Input = MahjongCommand extends infer C ? C extends {nonce:string} ? Omit<C,"nonce"> : never : never;
const cmd = (input: Input) => ({ ...input, nonce: randomUUID() }) as MahjongCommand;

describe("private ephemeral mahjong rooms", () => {
  it("permits exactly four seats, one room per user and starts only after four ready players", () => {
    const store = new RoomStore();
    const room = store.execute(players[0], cmd({ action: "create", mode: "east" }))!;
    expect(() => store.execute(players[0], cmd({ action: "create", mode: "east" }))).toThrow();
    for (const player of players.slice(1, 4)) store.execute(player, cmd({ action: "join", code: room.code }));
    expect(() => store.execute(players[4], cmd({ action: "join", code: room.code }))).toThrow();
    expect(store.view(players[4].userId)).toBeNull();
    expect(() => store.execute(players[1], cmd({ action: "start", roomId: room.id }))).toThrow();
    expect(() => store.execute(players[0], cmd({ action: "start", roomId: room.id }))).toThrow();
    for (const player of players.slice(0,4)) store.execute(player, cmd({ action: "ready", ready: true, roomId: room.id }));
    expect(store.execute(players[0], cmd({ action: "start", roomId: room.id }))!.status).toBe("playing");
    expect(() => store.execute(players[2], cmd({ action: "leave", roomId: room.id }))).toThrow();
  });
  it("deduplicates a command and refuses the same nonce with different content", () => {
    const store = new RoomStore(), create = cmd({ action: "create", mode: "east" });
    const first = store.execute(players[0], create)!;
    expect(store.execute(players[0], create)!.id).toBe(first.id);
    expect(() => store.execute(players[0], { ...create, action: "leave", roomId: first.id })).toThrow();
    expect(() => store.execute(players[4], cmd({ action: "finish", roomId: first.id }))).toThrow();
    store.execute(players[1], cmd({ action: "join", code: first.code }));
    store.execute(players[0], cmd({ action: "leave", roomId: first.id }));
    expect(store.view(players[1].userId)!.hostUserId).toBe(players[1].userId);
    store.execute(players[1], cmd({ action: "finish", roomId: first.id }));
    expect(store.size).toBe(0);
  });
  it("keeps disconnected seats for ten minutes without poll requests keeping abandoned games alive", () => {
    let now = 1000;
    const store = new RoomStore({ now: () => now });
    store.execute(players[0], cmd({ action: "create", mode: "east" }));
    store.connection(players[0].userId, 1);
    now += 3600000;
    store.sweep(); expect(store.size).toBe(1);
    store.connection(players[0].userId, -1);
    now += 599999;
    store.sweep(); expect(store.view(players[0].userId)).not.toBeNull();
    now++;
    store.sweep(); expect(store.size).toBe(0);
    expect(store.view(players[0].userId)).toBeNull();
  });
  it("cannot replay an old room's finish against a new room even after nonce eviction", () => {
    const store = new RoomStore();
    const old = store.execute(players[0], cmd({ action:"create",mode:"east" }))!;
    const finish = cmd({ action:"finish",roomId:old.id });
    store.execute(players[0],finish);
    const current = store.execute(players[0],cmd({ action:"create",mode:"east" }))!;
    for(let n=0;n<4097;n++) store.execute(players[0],cmd({action:"ready",ready:n%2===0,roomId:current.id}));
    expect(()=>store.execute(players[0],finish)).toThrow();
    expect(store.view(players[0].userId)!.id).toBe(current.id);
  });
});
