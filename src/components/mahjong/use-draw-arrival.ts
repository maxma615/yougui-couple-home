"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView } from "@/modules/mahjong/types";

type Source = { connected: boolean; canAnimate: boolean };
type Snapshot = { scope: string; decision: string; connected: boolean };

// A displayed drawn tile is state. Only a new live decision is an arrival.
export function useDrawArrival(game: GameView | null, roomId: string, ownSeat: number, source: Source) {
  const previous = useRef<Snapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arrival, setArrival] = useState<string | null>(null);
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArrival(null);
  }, []);
  const scope = game?.gameInstanceId && Number.isInteger(game.handId)
    ? JSON.stringify([roomId, game.gameInstanceId, game.handId, ownSeat]) : null;
  const drawKey = scope && game?.drawnTile ? JSON.stringify([scope, game.decisionId]) : null;

  useEffect(() => {
    const old = previous.current;
    previous.current = scope && game ? { scope, decision: game.decisionId, connected: source.connected } : null;
    if (!game || !scope || !source.connected || !source.canAnimate || !old?.connected || old.scope !== scope) {
      cancel();
      return;
    }
    if (old.decision === game.decisionId) return;
    cancel();
    if (!drawKey || game.turnSeat !== ownSeat || game.settlement || !["zimo", "gangzimo", "nukizimo"].includes(game.phase)) return;
    setArrival(drawKey);
    timer.current = setTimeout(() => { setArrival(null); timer.current = null; }, 220);
  }, [game, scope, drawKey, ownSeat, source.connected, source.canAnimate, cancel]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { arriving: source.connected && source.canAnimate && arrival !== null && arrival === drawKey, cancel };
}
