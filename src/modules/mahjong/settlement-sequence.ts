import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { GameView, MahjongGame, Settlement } from "./types";

type Sequence = {
  id: string;
  snapshots: GameView[];
  details: Settlement[];
  oldScores: number[];
  delta: number[];
  index: number;
  startedAt: number;
  pending: Set<number>;
};

/** Native engines calculate their usual payments. This adapter keeps the next
 * native hand private while all seats traverse one shared result presentation. */
export class SettlementSequenceGame implements MahjongGame {
  private sequence: Sequence | null = null;
  private readonly now: () => number;

  constructor(private readonly engine: MahjongGame, private readonly seatCount: 3 | 4, options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
    this.collectWin();
  }

  private seats() { return Array.from({ length: this.seatCount }, (_, seat) => seat); }

  private collectWin() {
    const first = this.engine.view(0);
    if (first.ranking || first.settlement?.kind !== "win") return;
    if (first.handId === undefined || !first.gameInstanceId) throw Error("Result sequence requires native hand identity");
    const snapshots = this.seats().map(seat => structuredClone(this.engine.view(seat)));
    const oldScores = this.seats().map(seat => {
      const player = first.players.find(player => player.seat === seat);
      if (!player) throw Error("Result sequence has an incomplete seat map");
      return player.score;
    });
    const details: Settlement[] = [];
    for (let page = 0; page < this.seatCount; page++) {
      const current = this.engine.view(0);
      if (current.gameInstanceId !== first.gameInstanceId || current.handId !== first.handId || current.ranking || current.settlement?.kind !== "win") {
        throw Error("Unexpected native result boundary");
      }
      if (current.settlement.delta.length !== this.seatCount || !current.settlement.delta.every(Number.isFinite)) throw Error("Invalid native result delta");
      details.push(structuredClone(current.settlement));
      for (const seat of this.seats()) {
        const view = this.engine.view(seat);
        const ack = view.choices.find(choice => choice.type === "ack");
        if (view.decisionId !== current.decisionId || !ack) throw Error("Native result requires all legal ACKs");
        this.engine.respond(seat, view.decisionId, ack.id);
      }
      const next = this.engine.view(0);
      if (next.gameInstanceId !== first.gameInstanceId || next.decisionId === current.decisionId) throw Error("Native result failed to advance");
      if (next.ranking || next.handId !== first.handId) break;
      if (page === this.seatCount - 1) throw Error("Native result exceeded seat bound");
    }
    const delta = this.seats().map(seat => details.reduce((sum, detail) => sum + detail.delta[seat], 0));
    this.sequence = { id: randomUUID(), snapshots, details, oldScores, delta, index: 0, startedAt: this.now(), pending: new Set(this.seats()) };
  }

  respond(seat: number, decisionId: string, choiceId: string) {
    const sequence = this.sequence;
    if (!sequence) {
      this.engine.respond(seat, decisionId, choiceId);
      this.collectWin();
      return;
    }
    if (decisionId !== `${sequence.id}:${sequence.index}`) throw new AppError(409, "stale_decision", "牌局已更新，请按当前牌面操作");
    if (choiceId !== "ack" || !sequence.pending.has(seat)) throw new AppError(409, "illegal_choice", "当前不能执行这个操作");
    sequence.pending.delete(seat);
    if (sequence.pending.size) return;
    sequence.index++;
    if (sequence.index > sequence.details.length) { this.sequence = null; return; }
    sequence.pending = new Set(this.seats());
    sequence.startedAt = this.now();
  }

  view(seat: number): GameView {
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.seatCount) throw new AppError(403, "seat_required", "你没有牌桌席位");
    const sequence = this.sequence;
    if (!sequence) return this.engine.view(seat);
    const scores = sequence.index === sequence.details.length;
    const view = structuredClone(sequence.snapshots[seat]);
    view.decisionId = `${sequence.id}:${sequence.index}`;
    view.phase = scores ? "score_change" : "hule";
    view.ranking = null;
    view.settlement = structuredClone(sequence.details[Math.min(sequence.index, sequence.details.length - 1)]);
    if (scores) view.settlement.delta = sequence.delta.slice();
    view.choices = sequence.pending.has(seat) ? [{ id: "ack", type: "ack" }] : [];
    view.settlementFlow = {
      id: sequence.id, stage: scores ? "scores" : "detail", detailIndex: sequence.index, detailCount: sequence.details.length,
      elapsedMs: Math.max(0, this.now() - sequence.startedAt), oldScores: sequence.oldScores.slice(), delta: sequence.delta.slice(),
      newScores: sequence.oldScores.map((score, seat) => score + sequence.delta[seat]),
    };
    return view;
  }
}
