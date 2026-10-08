"use client";

import { useEffect, useRef, useState } from "react";

type LockableOrientation = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

const landscape = () => window.matchMedia ? window.matchMedia("(orientation: landscape)").matches : window.innerWidth >= window.innerHeight;
const rotationHint = "当前浏览器无法自动横屏，请旋转手机后继续。";

export function useTableScreen() {
  const [hint, setHint] = useState("");
  const [pending, setPending] = useState(false);
  const lifecycle = useRef({ mounted: true, fullscreen: false, orientation: false, orientationSession: null as Element | null, pending: false });
  useEffect(() => {
    const state = lifecycle.current;
    state.mounted = true;
    const media = window.matchMedia?.("(orientation: landscape)");
    const rotated = () => { if (landscape()) setHint(""); };
    const fullscreenChanged = () => {
      if (state.fullscreen && document.fullscreenElement !== document.documentElement) state.fullscreen = false;
      // An Escape/browser exit ends our ownership. Do not later exit a new
      // fullscreen session started by another part of the page.
      if (state.orientation && document.fullscreenElement !== state.orientationSession) { window.screen.orientation?.unlock?.(); state.orientation = false; state.orientationSession = null; }
    };
    media?.addEventListener?.("change", rotated);
    window.addEventListener("resize", rotated);
    window.addEventListener("orientationchange", rotated);
    document.addEventListener("fullscreenchange", fullscreenChanged);
    return () => {
      media?.removeEventListener?.("change", rotated);
      window.removeEventListener("resize", rotated);
      window.removeEventListener("orientationchange", rotated);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      state.mounted = false;
      if (state.orientation) { window.screen.orientation?.unlock?.(); state.orientation = false; state.orientationSession = null; }
      if (state.fullscreen && document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen?.().catch(() => {});
      }
      state.fullscreen = false;
    };
  }, []);

  async function enter() {
    const state = lifecycle.current;
    if (state.pending) return;
    state.pending = true;
    setPending(true);
    try {
      if (!document.fullscreenElement) {
        if (!document.documentElement.requestFullscreen) throw new Error("fullscreen unavailable");
        await document.documentElement.requestFullscreen();
        state.fullscreen = true;
      }
      if (!state.mounted) {
        if (state.fullscreen && document.fullscreenElement === document.documentElement) await document.exitFullscreen?.();
        state.fullscreen = false;
        return;
      }
      const session = document.fullscreenElement;
      if (!session) throw new Error("fullscreen ended");
      const orientation = window.screen.orientation as LockableOrientation | undefined;
      if (!orientation?.lock) throw new Error("orientation unavailable");
      await orientation.lock("landscape");
      state.orientation = true;
      state.orientationSession = session;
      if (!state.mounted || document.fullscreenElement !== session) {
        orientation.unlock?.(); state.orientation = false; state.orientationSession = null;
        if (state.mounted) setHint(landscape() ? "" : rotationHint);
        return;
      }
      setHint("");
    } catch {
      if (state.mounted) setHint(landscape() ? "" : rotationHint);
    } finally {
      state.pending = false;
      if (state.mounted) setPending(false);
    }
  }
  return { enter, hint, pending };
}
