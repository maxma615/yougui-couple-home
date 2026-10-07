"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RoomView } from "@/modules/mahjong/types";
import { acceptedNukiEvent, uniqueOwnNorthInstance } from "./nuki-motion";
import { measureDiscardElement, rectToFlight, type FlightView } from "./use-discard-motion";
import type { HandReflowTile } from "./hand-reflow";

type Baseline = {
  room: RoomView;
  connected: boolean;
  tiles: HandReflowTile[];
  sources: Map<string, ReturnType<typeof measureDiscardElement>>;
};
type Active = {
  id: string;
  decision: string;
  target: HTMLElement;
  visibility: string;
  priority: string;
  emphasis?: Animation;
};

export function useNukiMotion({ room, ownSeat, connected, canAnimate, tableRef }: {
  room: RoomView;
  ownSeat: number;
  connected: boolean;
  canAnimate: boolean;
  tableRef: RefObject<HTMLDivElement | null>;
}) {
  const previous = useRef<Baseline | null>(null);
  const active = useRef<Active | null>(null);
  const [flight, setFlight] = useState<FlightView | null>(null);
  const [held, setHeld] = useState<string | null>(null);

  const restore = useCallback(() => {
    const current = active.current;
    active.current = null;
    if (current) {
      if (current.emphasis) current.emphasis.onfinish = null;
      current.emphasis?.cancel();
      if (current.visibility) current.target.style.setProperty("visibility", current.visibility, current.priority);
      else current.target.style.removeProperty("visibility");
    }
    setFlight(null);
    setHeld(null);
  }, []);
  const finishFlight = useCallback((id: string) => {
    if (active.current?.id === id) restore();
  }, [restore]);
  const cancel = restore;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  const eligible = connected && canAnimate && !reducedMotion && !hidden;
  const predicted = eligible && previous.current?.connected ? acceptedNukiEvent(previous.current.room, room) : null;
  // Prevent the replacement painting an entrance before the layout effect
  // establishes the durable hold. Rules and choices are already current.
  const heldDecisionId = held ?? (predicted?.seat === ownSeat ? room.game!.decisionId : null);

  useLayoutEffect(() => {
    const old = previous.current;
    const table = tableRef.current;
    const event = eligible && old?.connected ? acceptedNukiEvent(old.room, room) : null;
    const sameScope = old && old.room.id === room.id && old.room.mySeat === room.mySeat
      && old.room.game?.gameInstanceId === room.game?.gameInstanceId && old.room.game?.handId === room.game?.handId;
    if (active.current && (!connected || reducedMotion || hidden || !sameScope || old?.connected !== connected
      || room.game?.settlement || room.game?.decisionId !== active.current.decision)) restore();

    if (event && table) {
      restore();
      const target = table.querySelector<HTMLElement>(`[data-nuki-seat="${event.seat}"] [data-nuki-index="${event.index}"] .mahjong-tile`);
      const destination = target && measureDiscardElement(target);
      if (target && destination) {
        const next: Active = {
          id: event.id, decision: room.game!.decisionId, target,
          visibility: target.style.getPropertyValue("visibility"), priority: target.style.getPropertyPriority("visibility"),
        };
        active.current = next;
        const sourceId = event.seat === ownSeat ? uniqueOwnNorthInstance(old!.tiles) : null;
        const source = sourceId ? old!.sources.get(sourceId) : null;
        if (event.seat === ownSeat) setHeld(room.game!.decisionId);
        if (source && sourceId) {
          target.style.setProperty("visibility", "hidden");
          setFlight({
            event: { ...event, roomId: room.id, gameInstanceId: room.game!.gameInstanceId!, handId: room.game!.handId!, tile: "z4" },
            source: "own", sourceTileId: sourceId, sourcePaint: source.paint, targetPaint: destination.paint,
            from: rectToFlight(source.rect, source.geometry), to: rectToFlight(destination.rect, destination.geometry),
          });
        } else {
          try {
            const emphasis = target.animate([{ opacity: .45, filter: "brightness(1.35)" }, { opacity: 1, filter: "none" }],
              { duration: 230, easing: "ease-out", fill: "both" });
            emphasis.id = `mahjong-nuki-arrival:${event.id}`;
            active.current = { ...next, emphasis };
            emphasis.onfinish = () => finishFlight(event.id);
          } catch {
            finishFlight(event.id);
          }
        }
      }
    }

    const sources: Baseline["sources"] = new Map();
    const tiles: HandReflowTile[] = [];
    table?.querySelectorAll<HTMLElement>(".mahjong-hand [data-hand-instance-id][data-tile-face]").forEach(element => {
      const id = element.dataset.handInstanceId!;
      const face = element.dataset.tileFace!;
      const measurement = measureDiscardElement(element);
      if (measurement) {
        sources.set(id, measurement);
        tiles.push({ instanceId: id, face, rect: {
          x: measurement.rect.left, y: measurement.rect.top, width: measurement.rect.width, height: measurement.rect.height,
        } });
      }
    });
    previous.current = { room, connected, tiles, sources };
  }, [room, ownSeat, connected, canAnimate, eligible, reducedMotion, hidden, tableRef, restore, finishFlight]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const table = tableRef.current;
    let size = table?.getBoundingClientRect();
    const observer = typeof ResizeObserver === "undefined" || !table ? null : new ResizeObserver(() => {
      const next = table.getBoundingClientRect();
      if (!size || Math.abs(next.width - size.width) > .5 || Math.abs(next.height - size.height) > .5) cancel();
      size = next;
    });
    observer?.observe(table!);
    const events = ["resize", "orientationchange", "fullscreenchange", "webkitfullscreenchange"];
    events.forEach(event => window.addEventListener(event, cancel));
    window.visualViewport?.addEventListener("resize", cancel);
    screen.orientation?.addEventListener?.("change", cancel);
    document.addEventListener("visibilitychange", cancel);
    query?.addEventListener?.("change", cancel);
    return () => {
      observer?.disconnect();
      events.forEach(event => window.removeEventListener(event, cancel));
      window.visualViewport?.removeEventListener("resize", cancel);
      screen.orientation?.removeEventListener?.("change", cancel);
      document.removeEventListener("visibilitychange", cancel);
      query?.removeEventListener?.("change", cancel);
      restore();
    };
  }, [cancel, restore, tableRef]);

  return { flight, finishFlight, cancel, heldDecisionId };
}
