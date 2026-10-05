import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomStore } from "@/modules/mahjong/rooms";
import { BotRunner, BOT_WORKER_LIMITS } from "@/modules/mahjong/bot-runner";
import { chooseBotChoice } from "@/modules/mahjong/bot-strategy";
import type { GameVariant, MahjongCommand } from "@/modules/mahjong/types";

const runners: BotRunner[] = [];
afterEach(async () => { await Promise.all(runners.splice(0).map(r => r.close())); });
const command = (input: object) => ({ nonce: randomUUID(), ...input }) as MahjongCommand;
function table(variant: GameVariant = "sanma") {
  const rooms = new RoomStore();
  const human = { userId: randomUUID(), displayName: "Human" };
  const room = rooms.execute(human, command({ action: "create", mode: "east", variant }))!;
  rooms.execute(human, command({ action: "fill-bots", roomId: room.id }));
  rooms.execute(human, command({ action: "ready", ready: true, roomId: room.id }));
  rooms.connection(human.userId, 1);
  rooms.execute(human, command({ action: "start", roomId: room.id }));
  return { rooms, human, roomId: room.id };
}
function advanceHuman(t: ReturnType<typeof table>) {
  const room = t.rooms.view(t.human.userId)!;
  if (room.game?.choices.length) {
    t.rooms.execute(t.human, command({ action: "respond", roomId: room.id, decisionId: room.game.decisionId, choiceId: chooseBotChoice(room.game, room.variant, room.mySeat) }));
  }
}
function reachBot(t: ReturnType<typeof table>) {
  for (let i = 0; i < 20 && !t.rooms.botDecisions().some(job => job.roomId === t.roomId); i++) advanceHuman(t);
  expect(t.rooms.botDecisions().filter(job => job.roomId === t.roomId).length).toBeGreaterThan(0);
}
function fakeWorker(behavior: string, readyDelay = 0) {
  return new Worker(`const {parentPort}=require('node:worker_threads');setTimeout(()=>parentPort.postMessage({type:'ready',heapLimitBytes:60*1024*1024,rssBytes:process.memoryUsage().rss}),${readyDelay});parentPort.on('message',job=>{${behavior}});`, { eval: true, execArgv: [], resourceLimits: BOT_WORKER_LIMITS });
}

describe("real bounded computer runtime", () => {
  it.each(["sanma", "yonma"] as const)("plays a complete solo %s east game through actual worker decisions and final ranking", async variant => {
    const t = table(variant);
    const observed = new Set<string>();
    const runner = new BotRunner(t.rooms, { visualDelayMs: 0, onDecision: event => observed.add(event.choiceType) });
    runners.push(runner);
    const started = performance.now();
    for (let turn = 0; turn < 15000 && t.rooms.view(t.human.userId)!.status !== "finished"; turn++) {
      advanceHuman(t);
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    const room = t.rooms.view(t.human.userId)!;
    expect(room.status).toBe("finished");
    expect(room.game!.ranking).toHaveLength(variant === "sanma" ? 3 : 4);
    expect(runner.metrics.failures).toBe(0);
    expect(runner.metrics.timeouts).toBe(0);
    expect(runner.metrics.completed).toBeGreaterThan(50);
    expect(runner.metrics.heapLimitBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(runner.metrics.heapLimitBytes).toBeGreaterThan(0);
    expect(runner.metrics.peakWorkers).toBe(1);
    expect(runner.metrics.unexpectedErrors).toBe(0);
    expect(observed.has("discard")).toBe(true);
    expect(observed.has("ack")).toBe(true);
    console.info("BOT_GAME_METRICS", JSON.stringify({ variant, elapsedMs: performance.now() - started, ...runner.metrics, decisionMs: summary(runner.metrics.decisionMs), roundTripMs: summary(runner.metrics.roundTripMs), choiceTypes: [...observed] }));
    t.rooms.execute(t.human, command({ action: "rematch", roomId: room.id }));
    expect(t.rooms.view(t.human.userId)!.members.map(m => m.ready)).toEqual(variant === "sanma" ? [false, true, true] : [false, true, true, true]);
    t.rooms.execute(t.human, command({ action: "finish", roomId: room.id }));
    await vi.waitFor(() => expect(runner.workerRunning).toBe(false));
    // A cleanly stopped worker and normal cancellations do not poison a new table.
    const previousComputed = runner.metrics.computed;
    const next = t.rooms.execute(t.human, command({ action: "create", mode: "east", variant }))!;
    t.rooms.execute(t.human, command({ action: "fill-bots", roomId: next.id }));
    t.rooms.execute(t.human, command({ action: "ready", ready: true, roomId: next.id }));
    t.rooms.execute(t.human, command({ action: "start", roomId: next.id }));
    reachBot({ ...t, roomId: next.id });
    await vi.waitFor(() => expect(runner.metrics.computed).toBeGreaterThan(previousComputed));
    expect(runner.metrics.failures).toBe(0);
    expect(runner.metrics.fallbacks).toBe(0);
    expect(runner.metrics.peakWorkers).toBe(1);
  }, 120000);

  it("sends only the seat DTO, uses a ready handshake, and reuses one worker", async () => {
    const t = table();
    reachBot(t);
    const payloads: unknown[] = [];
    const runner = new BotRunner(t.rooms, { visualDelayMs: 0, workerFactory: () => {
      const worker = fakeWorker("parentPort.postMessage({type:'result',id:job.id,choiceId:job.view.choices[0].id,elapsedMs:1,rssBytes:process.memoryUsage().rss});", 250);
      const post = worker.postMessage.bind(worker);
      worker.postMessage = value => { payloads.push(value); post(value); };
      return worker;
    } });
    runners.push(runner);
    await vi.waitFor(() => expect(runner.metrics.completed).toBeGreaterThan(0));
    expect(runner.metrics.timeouts).toBe(0);
    expect(runner.metrics.workerStarts).toBe(1);
    const payload = payloads[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["id", "seat", "variant", "view"]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/_pai|_model|password|database|wall|userId/);
    for (const player of (payload.view as { players: object[] }).players) expect(player).not.toHaveProperty("hand");
  });

  it.each(["while(true){}", "process.exit(1)"])("bounds repeated worker failures and falls back legally: %s", async behavior => {
    const t = table();
    reachBot(t);
    const runner = new BotRunner(t.rooms, { visualDelayMs: 0, workerFactory: () => fakeWorker(behavior) });
    runners.push(runner);
    await vi.waitFor(() => { advanceHuman(t); expect(runner.metrics.failures).toBe(3); }, { timeout: 5000 });
    expect(runner.metrics.workerStarts).toBe(3);
    expect(runner.metrics.fallbacks).toBeGreaterThanOrEqual(3);
    await vi.waitFor(() => expect(runner.workerRunning).toBe(false));
    if (behavior.includes("while")) expect(runner.metrics.timeouts).toBe(3);
  });

  it("rejects excessive heap limits and invalid choices with a legal fallback", async () => {
    for (const behavior of ["heap", "illegal"]) {
      const t = table();
      reachBot(t);
      const runner = new BotRunner(t.rooms, { visualDelayMs: 0, workerFactory: () => behavior === "heap"
        ? new Worker("require('node:worker_threads').parentPort.postMessage({type:'ready',heapLimitBytes:128*1024*1024,rssBytes:1});", { eval: true, execArgv: [], resourceLimits: BOT_WORKER_LIMITS })
        : fakeWorker("parentPort.postMessage({type:'result',id:job.id,choiceId:'illegal',elapsedMs:1,rssBytes:1});") });
      runners.push(runner);
      await vi.waitFor(() => expect(runner.metrics.fallbacks).toBeGreaterThan(0));
      expect(runner.metrics.completed).toBeGreaterThan(0);
      expect(runner.metrics.failures).toBeGreaterThan(0);
      await runner.close();
    }
  });

  it("shares a bounded queue and one computational worker across eight tables", async () => {
    const rooms = new RoomStore();
    for (let n = 0; n < 8; n++) {
      const human = { userId: randomUUID(), displayName: `Human ${n}` };
      const room = rooms.execute(human, command({ action: "create", mode: "east" }))!;
      rooms.execute(human, command({ action: "fill-bots", roomId: room.id }));
      rooms.execute(human, command({ action: "ready", ready: true, roomId: room.id }));
      rooms.connection(human.userId, 1);
      rooms.execute(human, command({ action: "start", roomId: room.id }));
      reachBot({ rooms, human, roomId: room.id });
    }
    const runner = new BotRunner(rooms, { visualDelayMs: 0 });
    runners.push(runner);
    await vi.waitFor(() => expect(runner.metrics.completed).toBeGreaterThan(10));
    expect(runner.metrics.maxQueue).toBeGreaterThan(1);
    expect(runner.metrics.maxQueue).toBeLessThanOrEqual(32);
    expect(runner.metrics.peakWorkers).toBe(1);
    expect(runner.metrics.workerStarts).toBe(1);
    expect(runner.metrics.failures).toBe(0);
  });

  it("cancels an in-flight computation on offline, then rejects its result after a replacement room", async () => {
    const t = table();
    reachBot(t);
    const old = t.rooms.botDecisions()[0];
    const runner = new BotRunner(t.rooms, { visualDelayMs: 0, workerFactory: () => fakeWorker("while(true){}") });
    runners.push(runner);
    await vi.waitFor(() => expect(runner.metrics.heapLimitBytes).toBeGreaterThan(0));
    t.rooms.connection(t.human.userId, -1);
    await vi.waitFor(() => expect(runner.workerRunning).toBe(false));
    t.rooms.execute(t.human, command({ action: "finish", roomId: t.roomId }));
    const replacement = t.rooms.execute(t.human, command({ action: "create", mode: "east" }))!;
    expect(t.rooms.respondBot(old, old.view.choices[0].id)).toBe(false);
    await runner.close();
    expect(t.rooms.view(t.human.userId)!.id).toBe(replacement.id);
    expect(runner.metrics.failures).toBe(0);
    expect(runner.metrics.timeouts).toBe(0);
    expect(runner.queueSize).toBe(0);
  });

  it("immediately cancels paused/stale work without counting it as a failure; reconnect resumes", async () => {
    const t = table();
    reachBot(t);
    const runner = new BotRunner(t.rooms, { visualDelayMs: 300, workerFactory: () => fakeWorker("parentPort.postMessage({type:'result',id:job.id,choiceId:job.view.choices[0].id,elapsedMs:1,rssBytes:1});") });
    runners.push(runner);
    await vi.waitFor(() => expect(runner.metrics.computed).toBe(1));
    const version = t.rooms.view(t.human.userId)!.version;
    t.rooms.connection(t.human.userId, -1);
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(t.rooms.view(t.human.userId)!.version).toBe(version);
    expect(runner.workerRunning).toBe(false);
    expect(runner.metrics.failures).toBe(0);
    t.rooms.connection(t.human.userId, 1);
    await vi.waitFor(() => expect(t.rooms.view(t.human.userId)!.version).toBeGreaterThan(version));
    t.rooms.execute(t.human, command({ action: "finish", roomId: t.roomId }));
    await runner.close();
    expect(runner.workerRunning).toBe(false);
    expect(runner.queueSize).toBe(0);
    expect(runner.metrics.failures).toBe(0);
  });
});

function summary(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  return { count: values.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) };
}
