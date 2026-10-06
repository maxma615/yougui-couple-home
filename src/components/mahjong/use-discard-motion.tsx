"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RoomView } from "@/modules/mahjong/types";
import { TileFace } from "./mahjong-tile";
import {
  DiscardMotionTracker,
  type DiscardMotionEvent,
  type DiscardMotionIntent,
  type MotionRect,
  type MotionSourceGeometry,
} from "./discard-motion";

type PointRect = MotionRect;

type FlightGeometry = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  scale: number;
}>;

type FlightView = Readonly<{
  event: DiscardMotionEvent;
  source: "own" | "opponent";
  sourceTileId?: string;
  from: FlightGeometry;
  to: FlightGeometry;
}>;

export function useDiscardMotion({
  room,
  ownSeat,
  connected,
  canAnimate,
  intent,
  tableRef,
}: {
  room: RoomView;
  ownSeat: number;
  connected: boolean;
  canAnimate: boolean;
  intent: DiscardMotionIntent | null;
  tableRef: RefObject<HTMLDivElement | null>;
}) {
  const tracker = useRef(new DiscardMotionTracker());
  const previousRackRects = useRef(new Map<number, FlightGeometry>());
  const environmentEpoch = useRef(0);
  const priorConnection = useRef(connected);
  const activeFlight = useRef<FlightView | null>(null);
  const [flight, setFlight] = useState<FlightView | null>(null);
  const [hiddenEvents, setHiddenEvents] = useState<ReadonlySet<string>>(() => new Set());

  const captureRackRects = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const next = new Map<number, FlightGeometry>();
    table.querySelectorAll<HTMLElement>("[data-motion-rack-seat] > i").forEach((element) => {
      const seat = Number(element.parentElement?.dataset.motionRackSeat);
      if (!Number.isInteger(seat) || seat === ownSeat) return;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) next.set(seat, elementToFlight(element, rect));
    });
    previousRackRects.current = next;
  }, [ownSeat, tableRef]);

  const cancelFlight = useCallback((refreshRacks = false) => {
    activeFlight.current = null;
    setFlight(null);
    setHiddenEvents(new Set());
    if (refreshRacks) captureRackRects();
  }, [captureRackRects]);

  const invalidateEnvironment = useCallback((refreshRacks = true) => {
    environmentEpoch.current++;
    cancelFlight(refreshRacks);
  }, [cancelFlight]);

  const finishFlight = useCallback((eventId: string) => {
    if (activeFlight.current?.event.id !== eventId) return;
    activeFlight.current = null;
    setFlight(null);
    setHiddenEvents((events) => {
      const next = new Set(events);
      next.delete(eventId);
      return next;
    });
  }, []);
  const getEnvironmentEpoch = useCallback(() => environmentEpoch.current, []);

  useLayoutEffect(() => {
    if (priorConnection.current !== connected) {
      priorConnection.current = connected;
      invalidateEnvironment(false);
    }
    const table = tableRef.current;
    const reducedMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    const eligible = connected && canAnimate && !reducedMotion && !hidden;
    const currentIntent = intent?.environmentEpoch === environmentEpoch.current ? intent : null;
    const result = tracker.current.observe(room, { canAnimate: eligible, intent: currentIntent });

    if (!connected || reducedMotion || hidden) cancelFlight();
    if (result.reset || (!eligible && result.newEvents.length > 0)) cancelFlight();
    if (result.cancelledEventIds.some((eventId) => activeFlight.current?.event.id === eventId)) cancelFlight();

    if (result.flight && table) {
      const eventId = result.flight.event.id;
      const target = [...table.querySelectorAll<HTMLElement>("[data-discard-event-id]")]
        .find((element) => element.dataset.discardEventId === eventId);
      const face = target?.querySelector<HTMLElement>(".mahjong-tile");
      const targetRect = face?.getBoundingClientRect();
      const cachedSource = result.flight.source === "opponent"
        ? previousRackRects.current.get(result.flight.event.seat)
        : undefined;
      const sourceRect = result.flight.source === "own"
        ? result.flight.sourceRect
        : undefined;

      if (target && face && targetRect && (sourceRect || cachedSource) && targetRect.width > 0 && targetRect.height > 0) {
        const from = cachedSource || rectToFlight(sourceRect!, result.flight.sourceGeometry!);
        const to = targetToFlight(face, targetRect);
        const next: FlightView = {
          event: result.flight.event,
          source: result.flight.source,
          sourceTileId: result.flight.sourceTileId,
          from,
          to,
        };
        activeFlight.current = next;
        setFlight(next);
        setHiddenEvents(new Set([eventId]));
      }
    }

    captureRackRects();
  }, [room, ownSeat, connected, canAnimate, intent, tableRef, captureRackRects, cancelFlight, invalidateEnvironment]);

  useEffect(() => {
    const cancelAndRefresh = () => invalidateEnvironment(true);
    const cancelForVisibility = () => {
      invalidateEnvironment(true);
    };
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMotionPreference = () => invalidateEnvironment(true);
    const observer = typeof ResizeObserver === "undefined" || !tableRef.current
      ? null
      : new ResizeObserver(cancelAndRefresh);

    window.addEventListener("resize", cancelAndRefresh);
    window.addEventListener("orientationchange", cancelAndRefresh);
    window.addEventListener("fullscreenchange", cancelAndRefresh);
    window.addEventListener("webkitfullscreenchange", cancelAndRefresh);
    window.visualViewport?.addEventListener("resize", cancelAndRefresh);
    screen.orientation?.addEventListener?.("change", cancelAndRefresh);
    document.addEventListener("visibilitychange", cancelForVisibility);
    query?.addEventListener?.("change", onMotionPreference);
    if (tableRef.current) observer?.observe(tableRef.current);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", cancelAndRefresh);
      window.removeEventListener("orientationchange", cancelAndRefresh);
      window.removeEventListener("fullscreenchange", cancelAndRefresh);
      window.removeEventListener("webkitfullscreenchange", cancelAndRefresh);
      window.visualViewport?.removeEventListener("resize", cancelAndRefresh);
      screen.orientation?.removeEventListener?.("change", cancelAndRefresh);
      document.removeEventListener("visibilitychange", cancelForVisibility);
      query?.removeEventListener?.("change", onMotionPreference);
    };
  }, [tableRef, captureRackRects, cancelFlight, invalidateEnvironment]);

  return {
    flight,
    hiddenEventIds: hiddenEvents,
    finishFlight,
    environmentEpoch: getEnvironmentEpoch,
  };
}

function rectToFlight(rect: PointRect, geometry: MotionSourceGeometry): FlightGeometry {
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    ...geometry,
  };
}

export function measureDiscardElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const geometry = elementToFlight(element, rect);
  return {
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    geometry: { width: geometry.width, height: geometry.height, angle: geometry.angle, scale: geometry.scale },
  };
}

function targetToFlight(face: HTMLElement, rect: DOMRect): FlightGeometry {
  return elementToFlight(face, rect);
}

function elementToFlight(element: HTMLElement, rect: DOMRect): FlightGeometry {
  const style = getComputedStyle(element);
  const width = numeric(style.width) || element.offsetWidth || rect.width;
  const height = numeric(style.height) || element.offsetHeight || rect.height;
  const { angle, scale } = accumulatedTransform(element);
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    width,
    height,
    angle,
    scale,
  };
}

function numeric(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function accumulatedTransform(element: HTMLElement) {
  let a = 1, b = 0, c = 0, d = 1;
  for (let current: HTMLElement | null = element; current && current !== document.body; current = current.parentElement) {
    const matrix = parseTransform(getComputedStyle(current).transform);
    const nextA = matrix.a * a + matrix.c * b;
    const nextB = matrix.b * a + matrix.d * b;
    const nextC = matrix.a * c + matrix.c * d;
    const nextD = matrix.b * c + matrix.d * d;
    a = nextA; b = nextB; c = nextC; d = nextD;
  }
  return { angle: Math.atan2(b, a) * 180 / Math.PI, scale: Math.hypot(a, b) || 1 };
}

function parseTransform(transform: string) {
  if (!transform || transform === "none") return { a: 1, b: 0, c: 0, d: 1 };
  const values = transform.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number);
  if (values?.length === 6 && values.every(Number.isFinite)) return { a: values[0], b: values[1], c: values[2], d: values[3] };
  const values3d = transform.match(/matrix3d\(([^)]+)\)/)?.[1].split(",").map(Number);
  if (values3d?.length === 16 && values3d.every(Number.isFinite)) return { a: values3d[0], b: values3d[1], c: values3d[4], d: values3d[5] };
  return { a: 1, b: 0, c: 0, d: 1 };
}

export function DiscardFlightLayer({ flight, onFinish }: { flight: FlightView; onFinish: (eventId: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    let movement: Animation | null = null;
    let flip: Animation | null = null;
    try {
      movement = node.animate([
        keyframe(flight.from),
        keyframe(flight.to),
      ], { duration: 230, easing: "cubic-bezier(.18,.74,.28,1)", fill: "forwards" });
      movement.onfinish = () => onFinish(flight.event.id);
      if (flight.source === "opponent") {
        const card = node.querySelector<HTMLElement>(".mahjong-discard-flight__card");
        if (card) flip = card.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration: 230, easing: "ease-in-out", fill: "forwards" });
      }
    } catch {
      movement?.cancel();
      flip?.cancel();
      onFinish(flight.event.id);
    }
    return () => {
      movement?.cancel();
      flip?.cancel();
    };
  }, [flight, onFinish]);

  const style = {
    left: `${flight.from.left}px`,
    top: `${flight.from.top}px`,
    width: `${flight.from.width}px`,
    height: `${flight.from.height}px`,
    transform: transform(flight.from),
  };
  return typeof document === "undefined" ? null : createPortal(
    <div
      ref={element}
      className="mahjong-discard-flight"
      data-testid="mahjong-discard-flight"
      data-motion-seat={flight.event.seat}
      data-motion-source={flight.source}
      data-motion-event={flight.event.id}
      data-motion-source-tile-id={flight.sourceTileId}
      aria-hidden="true"
      style={style}
    >
      <span className="mahjong-discard-flight__card">
        {flight.source === "opponent" ? <span className="mahjong-discard-flight__back"/> : null}
        <TileFace value={flight.event.tile} className="mahjong-discard-flight__face"/>
      </span>
    </div>,
    document.body,
  );
}

function transform(geometry: FlightGeometry) {
  return `translate(-50%, -50%) rotate(${geometry.angle}deg) scale(${geometry.scale})`;
}

function keyframe(geometry: FlightGeometry): Keyframe {
  return {
    left: `${geometry.left}px`,
    top: `${geometry.top}px`,
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    transform: transform(geometry),
  };
}
