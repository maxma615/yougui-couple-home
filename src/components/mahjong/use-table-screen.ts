"use client";

import { useEffect, useRef, useState } from "react";

type LockableOrientation = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

export function useTableScreen() {
  const [hint, setHint] = useState("");
  const [pending, setPending] = useState(false);
  const lifecycle = useRef({ mounted: true, fullscreen: false, orientation: false, pending: false });
  useEffect(() => {
    const state = lifecycle.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      if (state.orientation) { window.screen.orientation?.unlock?.(); state.orientation = false; }
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
      const orientation = window.screen.orientation as LockableOrientation | undefined;
      if (!orientation?.lock) throw new Error("orientation unavailable");
      await orientation.lock("landscape");
      state.orientation = true;
      if (!state.mounted) { orientation.unlock?.(); state.orientation = false; return; }
      setHint("");
    } catch {
      if (state.mounted) setHint("当前浏览器无法自动横屏，请旋转手机后继续。");
    } finally {
      state.pending = false;
      if (state.mounted) setPending(false);
    }
  }
  return { enter, hint, pending };
}
