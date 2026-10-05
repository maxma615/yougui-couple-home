import { createHash, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { RiichiGame } from "./engine";
import type { GameMode, MahjongCommand, PlayerIdentity, RoomView } from "./types";

const nonce = z.string().uuid();
const commandSchema = z.discriminatedUnion("action", [
  z.object({ nonce, action: z.literal("create"), mode: z.enum(["east", "hanchan"]) }).strict(),
  z.object({ nonce, action: z.literal("join"), code: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{8}$/) }).strict(),
  z.object({ nonce, action: z.literal("ready"), ready: z.boolean(), roomId: z.string().uuid() }).strict(),
  ...["start", "leave", "finish", "rematch"].map(action => z.object({ nonce, action: z.literal(action as "start" | "leave" | "finish" | "rematch"), roomId: z.string().uuid() }).strict()),
  z.object({ nonce, action: z.literal("respond"), decisionId: z.string().max(80), choiceId: z.string().min(1).max(40), roomId: z.string().uuid() }).strict(),
]);

export function parseMahjongCommand(value: unknown): MahjongCommand {
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "invalid_mahjong_command", "牌桌操作无效，请检查房间码或刷新页面");
  return parsed.data as MahjongCommand;
}

type Seat = PlayerIdentity & { seat: number; ready: boolean };
type Room = { id: string; code: string; hostUserId: string; mode: GameMode; status: RoomView["status"]; version: number; members: Seat[]; game: RiichiGame | null; lastActivity: number; disconnectedSince: number | null };
export const ROOM_IDLE_MS = 10 * 60_000;

export class RoomStore {
  private rooms = new Map<string, Room>();
  private membership = new Map<string, string>();
  private connections = new Map<string, number>();
  private commands = new Map<string, string>();
  private readonly now: () => number;
  constructor(options: { now?: () => number } = {}) { this.now = options.now ?? Date.now; }
  get size() { return this.rooms.size; }

  connection(userId: string, delta: number) {
    const n = Math.max(0, (this.connections.get(userId) ?? 0) + delta);
    if (n) this.connections.set(userId, n); else this.connections.delete(userId);
    const room = this.ownRoom(userId);
    if (room) this.updateDisconnected(room);
  }

  private updateDisconnected(room: Room) {
    if (room.members.some(m => (this.connections.get(m.userId) ?? 0) > 0)) room.disconnectedSince = null;
    else room.disconnectedSince ??= this.now();
  }

  private ownRoom(userId: string) { return this.rooms.get(this.membership.get(userId) ?? ""); }
  private removeRoom(room: Room) {
    this.rooms.delete(room.id);
    room.members.forEach(m => this.membership.delete(m.userId));
  }

  sweep(now = this.now()) {
    for (const room of this.rooms.values()) {
      if (room.disconnectedSince !== null && now - Math.max(room.lastActivity, room.disconnectedSince) >= ROOM_IDLE_MS) this.removeRoom(room);
    }
  }

  view(userId: string): RoomView | null {
    const room = this.ownRoom(userId);
    const me = room?.members.find(m => m.userId === userId);
    if (!room || !me) return null;
    return {
      id: room.id, code: room.code, hostUserId: room.hostUserId, mode: room.mode, status: room.status,
      version: room.version, mySeat: me.seat,
      members: room.members.map(m => ({ ...m, connected: (this.connections.get(m.userId) ?? 0) > 0 })),
      game: room.game?.view(me.seat) ?? null,
    };
  }

  execute(player: PlayerIdentity, input: MahjongCommand): RoomView | null {
    const command = parseMahjongCommand(input);
    this.sweep();
    const key = player.userId + ":" + command.nonce;
    const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const seen = this.commands.get(key);
    if (seen) {
      if (seen !== hash) throw new AppError(409, "nonce_reused", "这个请求编号已用于其他操作");
      return this.view(player.userId);
    }
    this.apply(player, command);
    this.commands.set(key, hash);
    if (this.commands.size > 4096) this.commands.delete(this.commands.keys().next().value!);
    return this.view(player.userId);
  }

  private apply(player: PlayerIdentity, command: MahjongCommand) {
    let room = this.ownRoom(player.userId);
    if (command.action === "create") {
      if (room) throw new AppError(409, "already_seated", "请先离开当前牌桌");
      if (this.rooms.size >= 8) throw new AppError(429, "rooms_full", "当前牌桌已满，请稍后再创建");
      let code: string;
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      do { code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(""); } while ([...this.rooms.values()].some(r => r.code === code));
      room = { id: randomUUID(), code, hostUserId: player.userId, mode: command.mode, status: "lobby", version: 1, members: [{ ...player, seat: 0, ready: false }], game: null, lastActivity: this.now(), disconnectedSince: null };
      this.rooms.set(room.id, room);
      this.membership.set(player.userId, room.id);
      this.updateDisconnected(room);
      return;
    }
    if (command.action === "join") {
      if (room) throw new AppError(409, "already_seated", "请先离开当前牌桌");
      room = [...this.rooms.values()].find(r => r.code === command.code);
      if (!room) throw new AppError(404, "room_missing", "牌桌不存在或已结束");
      if (room.status !== "lobby" || room.members.length >= 4) throw new AppError(409, "room_unavailable", "牌桌已满或已经开局");
      const seat = [0,1,2,3].find(n => !room!.members.some(m => m.seat === n))!;
      room.members.push({ ...player, seat, ready: false });
      room.members.sort((a, b) => a.seat - b.seat);
      this.membership.set(player.userId, room.id);
      this.updateDisconnected(room);
    } else {
      if (!room) throw new AppError(409, "seat_required", "你没有当前牌桌，请创建或加入一桌");
      if (room.id !== command.roomId) throw new AppError(409, "room_changed", "牌桌已改变，请按当前牌桌操作");
      const member = room.members.find(m => m.userId === player.userId)!;
      if (["start", "finish", "rematch"].includes(command.action) && room.hostUserId !== player.userId) throw new AppError(403, "host_required", "只有房主可以执行这个操作");
      switch (command.action) {
        case "ready":
          if (room.status !== "lobby") throw new AppError(409, "game_in_progress", "当前不在准备阶段");
          member.ready = command.ready; break;
        case "start":
          if (room.status !== "lobby" || room.members.length !== 4 || !room.members.every(m => m.ready)) throw new AppError(409, "four_ready_required", "需要四位玩家全部准备");
          room.game = new RiichiGame(room.mode, room.members.map(m => m.displayName));
          room.status = "playing"; break;
        case "respond":
          if (room.status !== "playing" || !room.game) throw new AppError(409, "no_active_game", "当前没有进行中的对局");
          room.game.respond(member.seat, command.decisionId, command.choiceId);
          if (room.game.view(member.seat).ranking) room.status = "finished";
          break;
        case "leave":
          if (room.status === "playing") throw new AppError(409, "game_in_progress", "正在对局，短暂离线会保留你的座位；需要结束请由房主解散");
          room.members = room.members.filter(m => m.userId !== player.userId);
          this.membership.delete(player.userId);
          if (!room.members.length) { this.removeRoom(room); return; }
          if (room.hostUserId === player.userId) room.hostUserId = room.members[0].userId;
          this.updateDisconnected(room); break;
        case "finish": this.removeRoom(room); return;
        case "rematch":
          if (room.status !== "finished") throw new AppError(409, "game_not_finished", "请先完成当前对局");
          room.game = null; room.status = "lobby";
          room.members.forEach(m => { m.ready = false; }); break;
      }
    }
    room.version++;
    room.lastActivity = this.now();
  }
}
