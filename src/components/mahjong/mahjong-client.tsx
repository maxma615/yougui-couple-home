"use client";

import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleHelp, Clock3, Copy, Crown, Dices, DoorOpen, LoaderCircle, Radio, RefreshCw, Sparkles, Swords, Wifi, WifiOff, X } from "lucide-react";

import { apiRequest, errorMessage } from "@/components/api-client";
import { SessionProvider, useSession } from "@/hooks/use-session";
import type { Choice, GameMode, GameVariant, GameView, MahjongCommand, MahjongResponse, PublicPlayer, RoomMember, RoomView } from "@/modules/mahjong/types";
import { MahjongRules } from "./mahjong-rules";
import { TileFace, tileKey, tileName } from "./mahjong-tile";

const windNames = ["東", "南", "西", "北"];
const choiceNames: Record<Choice["type"], string> = {
  discard: "切牌",
  riichi: "立直",
  chi: "吃",
  pon: "碰",
  kan: "杠",
  tsumo: "自摸",
  ron: "荣和",
  abort: "九種九牌",
  pass: "过",
  ack: "继续",
  nuki: "拔北",
};
type CommandInput = MahjongCommand extends infer Command
  ? Command extends { nonce: string }
    ? Omit<Command, "nonce" | "roomId">
    : never
  : never;

function roundTitle(game: GameView) {
  return `${windNames[game.roundWind] || "東"}${game.roundNumber} 局`;
}

function phaseTitle(game: GameView) {
  if (game.settlement) return game.settlement.kind === "win" ? "和了结算" : "流局结算";
  const labels: Record<string, string> = {
    zimo: "摸牌",
    gangzimo: "杠后摸牌",
    dapai: "等待回应",
    fulou: "鸣牌后出牌",
    gang: "抢杠判断",
    hule: "确认和了",
    pingju: "确认流局",
    jieju: "本场结束",
  };
  return labels[game.phase] || "牌局进行中";
}

function MahjongRoot() {
  const { session, loading: sessionLoading, error: sessionError, refreshSession } = useSession();
  const [response, setResponse] = useState<MahjongResponse | null>(null);
  const [variant, setVariant] = useState<GameVariant>("yonma");
  const [showRules, setShowRules] = useState(false);
  const [mode, setMode] = useState<GameMode>("east");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const finishDialog = useRef<HTMLDialogElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const responseRef = useRef<MahjongResponse | null>(null);
  const responseRevision = useRef(0);
  const getSequence = useRef(0);
  const pendingMutation = useRef<number | null>(null);
  const [socketEpoch, setSocketEpoch] = useState(0);
  const room = response?.room || null;
  const isMember = session?.user.role === "member";

  const applyResponse = useCallback((next: MahjongResponse, expectedRevision?: number) => {
    if (expectedRevision !== undefined && expectedRevision !== responseRevision.current) return false;
    const current = responseRef.current;
    if (current?.room && next.room?.id === current.room.id && next.room.version < current.room.version) return false;
    // A different membership retires the old stream immediately, before React runs effect cleanup.
    if ((current?.room?.id ?? null) !== (next.room?.id ?? null)) {
      const oldSocket = socketRef.current;
      socketRef.current = null;
      oldSocket?.disconnect();
      setConnected(false);
      setSocketEpoch(epoch => epoch + 1);
    }
    responseRef.current = next;
    responseRevision.current++;
    setResponse(next);
    return true;
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    const revision = responseRevision.current;
    const sequence = ++getSequence.current;
    const isCurrent = () => revision === responseRevision.current && sequence === getSequence.current && pendingMutation.current === null;
    try {
      const next = await apiRequest<MahjongResponse>("/api/mahjong", { method: "GET" });
      if (!isCurrent()) return;
      if (applyResponse(next, revision) && !quiet) setNotice("");
    } catch (error) {
      if (!isCurrent()) return;
      if (!quiet) setNotice(errorMessage(error));
      if (error instanceof Error && "status" in error && (error as { status?: number }).status === 401) void refreshSession();
    }
  }, [applyResponse, refreshSession]);

  useEffect(() => {
    if (!session || !isMember) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      responseRevision.current++;
      window.clearInterval(interval);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, isMember, refresh]);

  useEffect(() => {
    if (!response?.serviceRunning || !session || !isMember) {
      const oldSocket = socketRef.current;
      socketRef.current = null;
      oldSocket?.disconnect();
      setConnected(false);
      return;
    }
    const socket = io({ path: "/mahjong/socket.io", addTrailingSlash: false, transports: ["websocket", "polling"], tryAllTransports: true, reconnection: true, reconnectionDelayMax: 4_000 });
    socketRef.current = socket;
    const isCurrent = () => socketRef.current === socket;
    socket.on("connect", () => {
      if (!isCurrent()) return;
      setConnected(true);
      void refresh(true);
    });
    socket.on("disconnect", () => { if (isCurrent()) setConnected(false); });
    socket.on("connect_error", () => { if (isCurrent()) setConnected(false); });
    socket.on("mahjong:state", (next: MahjongResponse) => {
      if (!isCurrent()) return;
      applyResponse(next);
      if (isCurrent()) setConnected(true);
    });
    socket.on("mahjong:error", (payload: { message?: string }) => {
      if (!isCurrent()) return;
      setNotice(payload.message || "实时牌局连接暂时中断，正在恢复。");
      void refresh(true);
    });
    return () => {
      if (isCurrent()) socketRef.current = null;
      socket.disconnect();
    };
  }, [response?.serviceRunning, session, isMember, refresh, applyResponse, socketEpoch]);

  useEffect(() => {
    if (!confirmFinish || !finishDialog.current) return;
    const dialog = finishDialog.current;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [confirmFinish]);

  const send = useCallback(async (command: CommandInput) => {
    const roomIdRequired = command.action !== "create" && command.action !== "join";
    const roomId = room?.id;
    if (roomIdRequired && !roomId) {
      setNotice("请先进入牌桌，再进行操作。");
      return;
    }
    if (pendingMutation.current !== null) return;
    const revision = ++responseRevision.current;
    pendingMutation.current = revision;
    let reconcile = false;
    setBusy(true);
    setNotice("");
    try {
      const next = await apiRequest<MahjongResponse>("/api/mahjong", {
        method: "POST",
        body: JSON.stringify({ ...command, ...(roomIdRequired ? { roomId } : {}), nonce: crypto.randomUUID() }),
      });
      // Socket delivery may already have observed this command or a later membership.
      reconcile = !applyResponse(next, revision);
    } catch (error) {
      if (responseRevision.current === revision) setNotice(errorMessage(error));
      reconcile = true;
    } finally {
      pendingMutation.current = null;
      setBusy(false);
      // Re-read after completion rather than guessing whether a delayed POST is newer than a socket.
      if (reconcile) await refresh(true);
    }
  }, [room?.id, refresh, applyResponse]);

  const closeRoom = () => {
    setConfirmFinish(false);
    void send({ action: "finish" });
  };

  if (sessionLoading) {
    return <main className="mahjong-page"><div className="mahjong-loading"><LoaderCircle size={22} className="mahjong-spin"/><span>正在准备牌桌…</span></div></main>;
  }
  if (!session) return <main className="mahjong-page"><div className="mahjong-loading">{sessionError || "请先登录后进入麻将室。"}<Link href="/login">前往登录</Link></div></main>;
  if (!isMember) return <main className="mahjong-page" />;
  if (!response) return <main className="mahjong-page"><div className="mahjong-loading"><span>{notice || "牌桌暂时无法连接。"}</span><button className="mahjong-button mahjong-button--gold" type="button" onClick={() => void refresh()}>重新加载</button></div></main>;

  const ownSeat = room?.mySeat ?? -1;
  const host = Boolean(room && session && room.hostUserId === session.user.id);

  return <main className="mahjong-page">
    <div className="mahjong-shell">
      <header className="mahjong-header">
        <Link href="/home" className="mahjong-brand" aria-label="返回情侣空间"><span className="mahjong-brand__mark"><Dices size={17}/></span><span>有归 <i>/</i> 麻将室</span></Link>
        <button type="button" className="mahjong-rules-trigger" onClick={() => setShowRules(true)}><CircleHelp size={14}/>查看规则</button>
        <div className={`mahjong-link-state${connected ? " is-connected" : response.serviceRunning ? " is-reconnecting" : ""}`} role="status">
          {connected ? <><Wifi size={14}/>实时同步</> : response.serviceRunning ? <><WifiOff size={14}/>正在恢复连接</> : <><Radio size={14}/>等待开桌</>}
        </div>
      </header>

      {notice || sessionError ? <div className="mahjong-notice" role="alert"><CircleHelp size={16}/><span>{notice || sessionError}</span><button type="button" aria-label="关闭提示" onClick={() => setNotice("")}><X size={16}/></button></div> : null}

      {!room ? <Lobby
        mode={mode}
        variant={variant}
        onVariant={setVariant}
        busy={busy}
        joinCode={joinCode}
        onMode={setMode}
        onJoinCode={(value) => setJoinCode(value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8))}
        onCreate={() => void send({ action: "create", mode, variant })}
        onJoin={() => void send({ action: "join", code: joinCode.trim().toUpperCase() })}
      /> : room.status === "lobby" ? <WaitingRoom
        room={room}
        busy={busy}
        host={host}
        ownSeat={ownSeat}
        onReady={(ready) => void send({ action: "ready", ready })}
        onStart={() => void send({ action: "start" })}
        onAddBot={(seat) => void send({ action: "add-bot", seat })}
        onRemoveBot={(seat) => void send({ action: "remove-bot", seat })}
        onFillBots={() => void send({ action: "fill-bots" })}
        onLeave={() => void send({ action: "leave" })}
        onFinish={() => setConfirmFinish(true)}
      /> : <GameRoom
        room={room}
        busy={busy}
        host={host}
        ownSeat={ownSeat}
        connected={connected}
        onChoice={(choice) => room.game && void send({ action: "respond", decisionId: room.game.decisionId, choiceId: choice.id })}
        onFinish={() => setConfirmFinish(true)}
        onRematch={() => void send({ action: "rematch" })}
        onLeave={() => void send({ action: "leave" })}
      />}

      <footer className="mahjong-footer">
        <span>全员离线 10 分钟或服务重启后，本局结束。</span>
      </footer>
    </div>

    {showRules ? <MahjongRules variant={room?.variant || variant} onClose={() => setShowRules(false)}/> : null}
    {confirmFinish ? <dialog ref={finishDialog} className="mahjong-confirm" aria-labelledby="mahjong-finish-title" onCancel={(event) => { event.preventDefault(); setConfirmFinish(false); }}>
      <div className="mahjong-confirm__seal"><DoorOpen size={20}/></div>
      <p className="mahjong-kicker">结束牌桌</p>
      <h2 id="mahjong-finish-title">确定解散这张牌桌？</h2>
      <p>解散后本局结束，牌局进度不会保存。</p>
      <div className="mahjong-confirm__actions"><button type="button" className="mahjong-button mahjong-button--quiet" onClick={() => setConfirmFinish(false)}>继续打牌</button><button type="button" className="mahjong-button mahjong-button--danger" disabled={busy} onClick={closeRoom}>{busy ? "正在解散…" : "解散牌桌"}</button></div>
    </dialog> : null}
  </main>;
}

export function MahjongClient() {
  return <SessionProvider requireHome={false}><MahjongRoot/></SessionProvider>;
}

function Lobby({ mode, variant, busy, joinCode, onMode, onVariant, onJoinCode, onCreate, onJoin }: {
  variant: GameVariant; onVariant: (variant: GameVariant) => void;
  mode: GameMode; busy: boolean; joinCode: string;
  onMode: (mode: GameMode) => void; onJoinCode: (value: string) => void; onCreate: () => void; onJoin: () => void;
}) {
  return <section className="mahjong-lobby">
    <div className="mahjong-lobby__copy">
      <p className="mahjong-kicker"><span/> {variant === "sanma" ? "THREE" : "FOUR"} SEATS · RIICHI</p>
      <h1>今晚，<br/><em>来一场。</em></h1>
      <p>三人或四人围坐，一场日本麻将。邀请朋友，也可以让电脑陪你练习。</p>
      <div className="mahjong-lobby__facts"><span><Swords size={15}/>真人与电脑</span><span><Sparkles size={15}/>赤宝牌</span><span><Clock3 size={15}/>东风或半庄</span></div>
    </div>
    <div className="mahjong-lobby__panel">
      <div className="mahjong-panel-heading"><div><p className="mahjong-kicker">TAKE A SEAT</p><h2>开始一场新牌局</h2></div><span className="mahjong-panel-heading__icon"><Dices size={21}/></span></div>
      <fieldset className="mahjong-mode-picker mahjong-variant-picker" disabled={busy}>
        <legend>选择人数</legend>
        <button type="button" aria-label="三人" aria-pressed={variant === "sanma"} className={variant === "sanma" ? "is-selected" : ""} onClick={() => onVariant("sanma")}><strong>三人</strong><small>日本三麻 · 可拔北</small></button>
        <button type="button" aria-label="四人" aria-pressed={variant === "yonma"} className={variant === "yonma" ? "is-selected" : ""} onClick={() => onVariant("yonma")}><strong>四人</strong><small>日本四麻 · 经典牌桌</small></button>
      </fieldset>
      <fieldset className="mahjong-mode-picker" disabled={busy}>
        <legend>选择局长</legend>
        <button className={mode === "east" ? "is-selected" : ""} type="button" aria-pressed={mode === "east"} onClick={() => onMode("east")}><strong>东风战</strong><small>东场 · 可连庄</small></button>
        <button className={mode === "hanchan" ? "is-selected" : ""} type="button" aria-pressed={mode === "hanchan"} onClick={() => onMode("hanchan")}><strong>半庄战</strong><small>完整 · 南场结束</small></button>
      </fieldset>
      <button className="mahjong-button mahjong-button--gold mahjong-create" type="button" disabled={busy} onClick={onCreate}>{busy ? <LoaderCircle size={17} className="mahjong-spin"/> : <Sparkles size={17}/>}创建{variant === "sanma" ? "三人" : ""}{mode === "east" ? "东风" : "半庄"}牌桌<ArrowRight size={17}/></button>
      <div className="mahjong-divider"><span>或者加入朋友的牌桌</span></div>
      <label className="mahjong-code-label" htmlFor="mahjong-join-code">输入 8 位房间码</label>
      <div className="mahjong-join-form"><input id="mahjong-join-code" inputMode="text" autoComplete="off" maxLength={8} value={joinCode} onChange={(event) => onJoinCode(event.target.value)} placeholder="例：N7K4Q2TP"/><button type="button" aria-label="加入牌桌" disabled={busy || joinCode.length !== 8} onClick={onJoin}>{busy ? <LoaderCircle size={17} className="mahjong-spin"/> : <ArrowRight size={17}/>}</button></div>
      <p className="mahjong-panel-note">创建牌桌后，把房间码分享给朋友。</p>
    </div>
  </section>;
}

function WaitingRoom({ room, busy, host, ownSeat, onReady, onStart, onAddBot, onRemoveBot, onFillBots, onLeave, onFinish }: {
  room: RoomView; busy: boolean; host: boolean; ownSeat: number;
  onAddBot: (seat: number) => void; onRemoveBot: (seat: number) => void; onFillBots: () => void;
  onReady: (ready: boolean) => void; onStart: () => void; onLeave: () => void; onFinish: () => void;
}) {
  const capacity = room.variant === "sanma" ? 3 : 4;
  const roomSeats = Array.from({ length: capacity }, (_, seat) => room.members.find((member) => member.seat === seat) || null);
  const readyCount = room.members.filter((member) => member.ready).length;
  const mine = room.members.find((member) => member.seat === ownSeat);
  return <section className="mahjong-waiting">
    <div className="mahjong-room-header"><div><p className="mahjong-kicker">PRIVATE TABLE · {room.mode === "east" ? "EAST ROUND" : "HALF GAME"}</p><h1>等朋友坐下</h1><p>{capacity === 3 ? "三人" : "四人"}牌桌 · 分享房间码邀请朋友，或添加电脑补位。</p></div><div className="mahjong-room-code"><span>房间码</span><strong data-testid="mahjong-room-code">{room.code}</strong><button type="button" aria-label="复制房间码" onClick={() => void navigator.clipboard?.writeText(room.code)}><Copy size={14}/></button></div></div>
    <div className={`mahjong-seat-grid${capacity === 3 ? " is-sanma" : ""}`} aria-label="牌桌座位">
      {roomSeats.map((member, seat) => <SeatCard key={seat} member={member} seat={seat} isMe={seat === ownSeat} waiting busy={busy} onAddBot={host ? () => onAddBot(seat) : undefined} onRemoveBot={host ? () => onRemoveBot(seat) : undefined} />)}
    </div>
    <div className="mahjong-waiting__bottom"><div className="mahjong-ready-count"><span className="mahjong-ready-count__ring"><span>{readyCount}</span>/{capacity}</span><div><strong>{readyCount === capacity ? `${capacity === 3 ? "三" : "四"}家已齐` : `还差 ${capacity - readyCount} 位准备`}</strong><small>全部准备后，房主可以开始</small></div></div><div className="mahjong-waiting__actions">
      {host && room.members.length < capacity ? <button type="button" className="mahjong-button mahjong-button--quiet" disabled={busy} onClick={onFillBots}>电脑补齐空位</button> : null}
      {mine ? <button className={`mahjong-button ${mine.ready ? "mahjong-button--quiet" : "mahjong-button--gold"}`} type="button" disabled={busy} onClick={() => onReady(!mine.ready)}>{mine.ready ? <><Check size={17}/>已准备 · 点击取消</> : <><Check size={17}/>准备好了</>}</button> : null}
      {host ? <button className="mahjong-button mahjong-button--start" type="button" disabled={busy || readyCount !== capacity || room.members.length !== capacity} onClick={onStart}>开始对局<ArrowRight size={17}/></button> : <span className="mahjong-host-note"><Crown size={14}/>等待房主开始</span>}
      <button className="mahjong-icon-button" type="button" aria-label="解散牌桌" disabled={busy || !host} title={host ? "解散牌桌" : "仅房主可解散"} onClick={onFinish}><X size={17}/></button>
      {!host ? <button className="mahjong-button mahjong-button--quiet" type="button" disabled={busy} onClick={onLeave}>离开</button> : null}
    </div></div>
  </section>;
}

function SeatCard({ member, seat, isMe, waiting = false, player, active = false, busy = false, onAddBot, onRemoveBot }: {
  member?: RoomMember | null; seat: number; isMe: boolean; waiting?: boolean; player?: PublicPlayer; active?: boolean; busy?: boolean; onAddBot?: () => void; onRemoveBot?: () => void;
}) {
  const wind = player?.wind ?? seat;
  return <article className={`mahjong-seat-card${member ? " is-occupied" : ""}${isMe ? " is-self" : ""}${active ? " is-active" : ""}${waiting ? " is-waiting" : ""}`} data-testid={waiting ? `mahjong-seat-${seat}` : `mahjong-player-${seat}`} data-turn={active ? "true" : "false"}>
    <span className="mahjong-seat-card__wind">{windNames[wind] || windNames[seat]}家</span>
    <span className="mahjong-seat-card__avatar">{member?.displayName.slice(0, 1) || (player ? "牌" : "＋")}</span>
    <span className="mahjong-seat-card__identity"><strong>{member?.displayName || (player ? "牌友" : "等一位牌友")}{isMe ? <small>我</small> : null}</strong><span>{player ? `${player.score.toLocaleString()} 点` : member ? "已入座" : "房间开放中"}</span></span>
    {member ? <span className={`mahjong-seat-card__ready${member.ready ? " is-ready" : ""}`}>{member.kind === "bot" ? <><Check size={12}/>电脑 · 自动准备</> : member.ready ? <><Check size={12}/>已准备</> : waiting ? "等待准备" : member.connected ? "在线" : "暂时离线"}</span> : null}
    {waiting && !member && onAddBot ? <button type="button" className="mahjong-seat-bot-button" disabled={busy} onClick={onAddBot}>添加电脑</button> : null}
    {waiting && member?.kind === "bot" && onRemoveBot ? <button type="button" className="mahjong-seat-bot-button" disabled={busy} onClick={onRemoveBot}>移除电脑</button> : null}
    {player?.riichi ? <span className="mahjong-seat-card__riichi">立直</span> : null}
  </article>;
}

export function GameRoom({ room, busy, host, ownSeat, connected, onChoice, onFinish, onRematch, onLeave }: {
  room: RoomView; busy: boolean; host: boolean; ownSeat: number; connected: boolean;
  onChoice: (choice: Choice) => void; onFinish: () => void; onRematch: () => void; onLeave: () => void;
}) {
  const game = room.game;
  const [riichiMode, setRiichiMode] = useState(false);
  useEffect(() => setRiichiMode(false), [game?.decisionId]);
  if (!game) return <section className="mahjong-empty-game"><LoaderCircle size={20} className="mahjong-spin"/>正在载入牌局…</section>;
  const isFinished = room.status === "finished";
  const capacity = game.players.length;
  const relativeSeat = (seat: number) => (seat - ownSeat + capacity) % capacity;
  const byRelative = (offset: number) => game.players.find((player) => relativeSeat(player.seat) === offset);
  const ownPlayer = game.players.find((player) => player.seat === ownSeat);
  const hand = game.drawnTile && game.hand.at(-1) === game.drawnTile ? game.hand.slice(0, -1) : game.hand;
  const discardChoices = game.choices.filter((choice) => choice.type === "discard");
  const riichiChoices = game.choices.filter((choice) => choice.type === "riichi");
  const otherChoices = game.choices.filter((choice) => !["discard", "riichi"].includes(choice.type));
  const allowedChoices = riichiMode ? riichiChoices : discardChoices;
  const ownMember = room.members.find((member) => member.seat === ownSeat);

  return <section className={`mahjong-game${room.variant === "sanma" ? " is-sanma" : ""}${isFinished ? " is-finished" : ""}`}>
    <header className="mahjong-game__topline"><div className="mahjong-game__round"><span className="mahjong-game__round-seal">{windNames[game.roundWind] || "東"}</span><div><strong>{roundTitle(game)}</strong><span>{room.mode === "east" ? "東風戰" : "半莊戰"} <i>·</i> 本場 {game.honba}</span></div></div><div className="mahjong-game__tempo"><span>{game.remainingTiles}<small>剩余</small></span><span className="mahjong-game__tempo-divider"/><span>{game.riichiSticks}<small>立直棒</small></span><span className="mahjong-game__phase"><i className={connected ? "is-live" : ""}/>{phaseTitle(game)}</span></div>{host ? <button className="mahjong-icon-button mahjong-game__exit" type="button" aria-label="结束并解散牌桌" onClick={onFinish}><DoorOpen size={17}/></button> : room.status === "finished" ? <button className="mahjong-icon-button mahjong-game__exit" type="button" aria-label="离开已结束牌桌" onClick={onLeave}><DoorOpen size={17}/></button> : null}</header>

    {!connected ? <div className="mahjong-reconnect" role="status"><WifiOff size={15}/>连接中断，正在重连…</div> : null}

    {isFinished && game.ranking ? <section className="mahjong-ranking" aria-label="最终名次"><p className="mahjong-kicker">FINAL TABLE</p><h1>这一场，<em>落子有声。</em></h1><div>{[...game.ranking].sort((a, b) => a.rank - b.rank).map((row) => {
      const player = game.players.find((candidate) => candidate.seat === row.seat);
      const member = room.members.find((candidate) => candidate.seat === row.seat);
      return <div className="mahjong-ranking__row" key={row.seat}><span>0{row.rank}</span><strong>{member?.displayName || (player?.seat === ownSeat ? ownMember?.displayName || "你" : "牌友")}</strong><b>{row.score.toLocaleString()} 点</b></div>;
    })}</div><div className="mahjong-ranking__actions">{host ? <button type="button" className="mahjong-button mahjong-button--gold" disabled={busy} onClick={onRematch}><RefreshCw size={16}/>再开一场</button> : <span>等待房主发起下一场</span>}{host ? <button type="button" className="mahjong-button mahjong-button--quiet" onClick={onFinish}>解散牌桌</button> : null}</div></section> : null}

    <div className="mahjong-table" data-testid="mahjong-board" data-turn-seat={game.turnSeat}>
      <div className="mahjong-table__grain" aria-hidden="true"/>
      {Array.from({ length: capacity - 1 }, (_, index) => index + 1).map(offset => {
        const player = byRelative(offset);
        const position = offset === 1 ? "east" : capacity === 3 || offset === 3 ? "west" : "north";
        return <div key={offset} className={`mahjong-table__position mahjong-table__position--${position}`}><PlayerPanel player={player} member={room.members.find(member => member.seat === player?.seat)} ownSeat={ownSeat} active={game.turnSeat === player?.seat} offset={offset} capacity={capacity}/></div>;
      })}
      <div className="mahjong-table__center">
        <div className="mahjong-table__center-wind"><span>{windNames[game.roundWind] || "東"}</span><small>ROUND</small></div>
        <div className="mahjong-table__dora"><span>寶牌指示</span><div>{game.doraIndicators.map((tile, index) => <TileFace key={`${tile}-${index}`} value={tile}/>)}</div></div>
        <span className="mahjong-table__wall">山牌 <b>{game.remainingTiles}</b></span>
      </div>
      {game.players.map((player) => <River key={player.seat} player={player} offset={relativeSeat(player.seat)} />)}
      <div className="mahjong-table__own"><PlayerPanel player={ownPlayer} member={ownMember} ownSeat={ownSeat} active={game.turnSeat === ownSeat} offset={0} capacity={capacity}/>
        <div className="mahjong-hand-block"><div className="mahjong-hand-label"><span>你的手牌</span><small>{game.hand.length} 張{game.drawnTile ? " · 摸牌" : ""}</small></div><div className="mahjong-hand" data-testid="mahjong-hand" aria-label="你的手牌">
          {hand.map((tile, index) => <HandActionTile key={`hand-${index}-${tile}`} value={tile} choices={allowedChoices.filter((choice) => choice.value && tileKey(choice.value) === tileKey(tile) && !choice.value.endsWith("_"))} disabled={busy} onChoice={onChoice}/ >)}
          {game.drawnTile ? <span className="mahjong-drawn-wrap"><i>摸</i><HandActionTile value={game.drawnTile} choices={allowedChoices.filter((choice) => choice.value && tileKey(choice.value) === tileKey(game.drawnTile!) && choice.value.endsWith("_"))} disabled={busy} drawn onChoice={onChoice}/></span> : null}
        </div></div>
      </div>
    </div>

    {!isFinished ? <div className="mahjong-action-dock" aria-label="可执行操作">
      {riichiChoices.length ? <button type="button" className={`mahjong-button mahjong-button--riichi${riichiMode ? " is-selected" : ""}`} aria-pressed={riichiMode} disabled={busy} onClick={() => setRiichiMode((value) => !value)}><Sparkles size={16}/>{riichiMode ? "选择立直牌" : "立直"}</button> : null}
      {otherChoices.map((choice) => <button key={choice.id} type="button" className={`mahjong-button ${["ron", "tsumo"].includes(choice.type) ? "mahjong-button--win" : choice.type === "pass" ? "mahjong-button--quiet" : "mahjong-button--action"}`} disabled={busy} data-choice-id={choice.id} data-choice-type={choice.type} onClick={() => onChoice(choice)}>{choice.type === "tsumo" || choice.type === "ron" ? <Sparkles size={15}/> : null}{choiceNames[choice.type]}{choice.value ? <small>{choiceDescription(choice.value)}</small> : null}</button>)}
      {!otherChoices.length && !discardChoices.length && !riichiChoices.length ? <div className="mahjong-action-dock__wait"><LoaderCircle size={15} className="mahjong-spin"/>等待其他玩家行动</div> : null}
      {riichiMode ? <button type="button" className="mahjong-action-dock__cancel" onClick={() => setRiichiMode(false)}>返回普通切牌</button> : null}
      {game.settlement ? <div className="mahjong-settlement" role="status"><span>{game.settlement.name}</span>{game.settlement.yaku.slice(0, 3).map((yaku) => <i key={yaku.name}>{yaku.name}</i>)}</div> : null}
    </div> : <div className="mahjong-action-dock"><span>牌桌已结束</span></div>}

    {game.settlement ? <SettlementPanel game={game} room={room}/> : null}
  </section>;
}

function PlayerPanel({ player, member, ownSeat, active, offset, capacity }: { player?: PublicPlayer; member?: RoomMember; ownSeat: number; active: boolean; offset: number; capacity: number }) {
  if (!player) return null;
  const relativeNames = capacity === 3 ? ["你", "下家", "上家"] : ["你", "下家", "对家", "上家"];
  return <div className={`mahjong-player${active ? " is-turn" : ""}${offset === 0 ? " is-you" : ""}`} data-seat={player.seat} data-testid={`player-${player.seat}`}>
    <div className="mahjong-player__head"><span className="mahjong-player__wind">{windNames[player.wind] || "東"}</span><div><strong>{member?.displayName || (player.seat === ownSeat ? "你" : "牌友")}</strong><small>{relativeNames[offset] || "牌友"}{member?.kind === "bot" ? " · 电脑" : ""}</small></div><b>{player.score.toLocaleString()}</b>{player.riichi ? <i className="mahjong-player__riichi">立直</i> : null}</div>
    <div className="mahjong-player__hidden" aria-label={`${member?.displayName || "牌友"}的手牌数量：${player.handCount}`}>
      {Array.from({ length: Math.min(player.handCount, 14) }, (_, index) => <i key={index}/>) }
      <span>{player.handCount}</span>
    </div>
    {player.melds.length ? <div className="mahjong-player__melds" role="group" aria-label={`${member?.displayName || "牌友"}的副露`}>
      {player.melds.map((meld, index) => <MeldView key={`${index}-${meld}`} meld={meld}/>) }
    </div> : null}
    {player.nuki !== undefined ? <div className="mahjong-player__nuki" aria-label={`公开拔北数量：${player.nuki}`} data-testid={`nuki-${player.seat}`}><span>北</span> × {player.nuki}</div> : null}
    {member?.kind === "human" && !member.connected ? <small className="mahjong-player__offline">暂时离线 · 座位保留</small> : null}
  </div>;
}

function MeldView({ meld }: { meld: string }) {
  const match = meld.match(/^([mpsz])([0-9+\-=]+)$/);
  if (!match) return <span className="mahjong-meld" aria-label="公开副露"><small>副露</small></span>;
  const suit = match[1];
  const digits = match[2].replace(/\D/g, "");
  const called = /[+\-=]/.test(match[2]);
  const closedKan = digits.length === 4 && !called;
  const kind = digits.length === 4 ? closedKan ? "暗杠" : "杠" : digits.length === 3 && (suit === "z" || /^([0-9])\1\1$/.test(digits)) ? "碰" : "吃";
  return <span className={`mahjong-meld${closedKan ? " is-closed" : ""}`} aria-label={`${kind}${closedKan ? "，暗牌" : ""}`} title={kind}>
    <small>{kind}</small><span className="mahjong-meld__tiles">{digits.split("").map((number, index) => closedKan
      ? <i className="mahjong-meld__back" aria-hidden="true" key={`${index}-${number}`}/>
      : <TileFace value={`${suit}${number}`} key={`${index}-${number}`} />)}</span>
  </span>;
}

function River({ player, offset }: { player: PublicPlayer; offset: number }) {
  return <div className={`mahjong-river mahjong-river--${offset}`} data-testid={`river-${player.seat}`} aria-label={`${windNames[player.wind] || "東"}家河牌`}>
    {player.discards.map((tile, index) => <span className="mahjong-river__tile" data-tile={tileKey(tile)} key={`${index}-${tile}`} aria-label={tileName(tile)} title={tileName(tile)}>{displayShortTile(tile)}</span>)}
  </div>;
}

function displayShortTile(value: string) {
  const key = tileKey(value);
  const honor: Record<string, string> = { z1: "東", z2: "南", z3: "西", z4: "北", z5: "白", z6: "發", z7: "中" };
  if (honor[key]) return honor[key];
  const suit = key[0] === "m" ? "萬" : key[0] === "p" ? "筒" : "索";
  return `${key[1] === "0" ? "5" : key[1]}${suit}`;
}

function choiceDescription(value: string) {
  const match = value.match(/^([mpsz])(\d+)/);
  if (!match) return value;
  return [...match[2]].map((number) => displayShortTile(`${match[1]}${number}`)).join(" ");
}

function HandActionTile({ value, choices, disabled, drawn = false, onChoice }: { value: string; choices: Choice[]; disabled: boolean; drawn?: boolean; onChoice: (choice: Choice) => void }) {
  const choice = choices[0];
  return <TileFace value={value} className={`${drawn ? "is-drawn" : ""}${choice ? " is-playable" : " is-locked"}`} type="button" disabled={!choice || disabled} data-choice-id={choice?.id} data-choice-type={choice?.type} aria-label={`${choice?.type === "riichi" ? "立直后切出" : "切出"} ${tileName(value)}`} onClick={() => choice && onChoice(choice)}/>;
}

function SettlementPanel({ game, room }: { game: GameView; room: RoomView }) {
  const settlement = game.settlement;
  if (!settlement) return null;
  const hanText = String(settlement.han ?? "");
  const yakuYakumanCount = settlement.yaku.reduce((count, yaku) => count + ((String(yaku.han).match(/\*+/)?.[0].length || 0)), 0);
  const yakumanCount = Math.max((hanText.match(/\*+/)?.[0].length || 0), yakuYakumanCount, /役満|役满/.test(hanText) ? 1 : 0);
  const hanLabel = yakumanCount ? `${yakumanCount > 1 ? `${yakumanCount}倍` : ""}役满` : `${hanText || "—"} 翻`;
  const winningTiles = settlement.hand ? parseWinningHand(settlement.hand) : [];
  const winner = settlement.winnerSeat === undefined ? null : room.members.find((member) => member.seat === settlement.winnerSeat);
  return <section className="mahjong-settlement-panel" aria-label="本局结算">
    <div><p className="mahjong-kicker">HAND RESULT</p><h2>{settlement.name}</h2><p>{settlement.kind === "win" ? `${hanLabel}${settlement.fu ? ` · ${settlement.fu} 符` : ""}` : "牌山已尽"}{settlement.points ? ` · ${settlement.points.toLocaleString()} 点` : ""}</p></div>
    <div className={`mahjong-settlement-panel__delta${room.variant === "sanma" ? " is-sanma" : ""}`}>{settlement.delta.map((delta, seat) => <span key={seat}><small>{room.members.find((member) => member.seat === seat)?.displayName || (seat === room.mySeat ? "你" : `${windNames[seat]}家`)}</small><b className={delta > 0 ? "is-positive" : delta < 0 ? "is-negative" : ""}>{delta > 0 ? "+" : ""}{delta.toLocaleString()}</b></span>)}</div>
    {winningTiles.length ? <div className="mahjong-winning-hand"><div><small>{winner?.displayName || "和牌"}的手牌</small>{settlement.winningTile ? <small>和牌：{tileName(settlement.winningTile)}</small> : null}</div><div>{winningTiles.map((tile, index) => <TileFace value={tile} key={`${index}-${tile}`} />)}</div></div> : null}
    {settlement.kind === "win" && settlement.uraIndicators.length ? <div className="mahjong-ura-indicators"><small>里宝牌指示</small><div>{settlement.uraIndicators.map((tile, index) => <TileFace value={tile} key={`${tile}-${index}`} />)}</div></div> : null}
    {settlement.yaku.length ? <ul>{settlement.yaku.map((yaku) => {
      const units = String(yaku.han).match(/\*+/)?.[0].length || 0;
      return <li key={yaku.name}><span>{yaku.name}</span><b>{units ? `${units > 1 ? `${units}倍` : ""}役满` : `${yaku.han} 翻`}</b></li>;
    })}</ul> : null}
  </section>;
}

function parseWinningHand(value: string) {
  const groups = value.split(",")[0];
  const tiles: string[] = [];
  for (const match of groups.matchAll(/([mpsz])(\d+)/g)) {
    for (const number of match[2]) tiles.push(`${match[1]}${number}`);
  }
  return tiles;
}
