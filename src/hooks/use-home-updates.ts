"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionState = "connecting" | "live" | "polling" | "offline";

export const connectionLabels: Record<ConnectionState, string> = {
  connecting: "正在连接两个人的更新",
  live: "另一方的更新会自动出现",
  polling: "实时连接暂时中断，仍会定时同步",
  offline: "当前离线，恢复网络后会自动刷新",
};

type UseHomeUpdatesOptions = {
  refresh: () => void | Promise<void>;
  pollMs?: number;
};

export function useHomeUpdates({ refresh, pollMs = 15_000 }: UseHomeUpdatesOptions) {
  const refreshRef = useRef(refresh);
  const running = useRef(false);
  const queued = useRef(false);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailures = useRef(0);
  const [state, setState] = useState<ConnectionState>("connecting");

  refreshRef.current = refresh;

  const safeRefresh = useCallback(async () => {
    if (running.current) {
      queued.current = true;
      return;
    }
    running.current = true;
    try {
      await refreshRef.current();
    } finally {
      running.current = false;
      if (queued.current) {
        queued.current = false;
        void safeRefresh().catch(() => undefined);
      }
    }
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let stopped = false;

    const stopPolling = () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = null;
    };

    const startPolling = () => {
      if (pollTimer.current) return;
      const delay = Math.min(pollMs * 8, pollMs * 2 ** Math.min(pollFailures.current, 3));
      pollTimer.current = setTimeout(async () => {
        pollTimer.current = null;
        try {
          await safeRefresh();
          pollFailures.current = 0;
        } catch {
          pollFailures.current += 1;
        }
        if (!stopped) startPolling();
      }, delay);
    };

    const connect = () => {
      if (stopped || !navigator.onLine) {
        setState("offline");
        return;
      }
      source?.close();
      setState(failures.current ? "polling" : "connecting");
      source = new EventSource("/api/events", { withCredentials: true });
      source.onopen = () => {
        failures.current = 0;
        stopPolling();
        setState("live");
      };
      const changed = () => void safeRefresh().catch(() => undefined);
      source.addEventListener("change", changed);
      source.addEventListener("reset", changed);
      source.onerror = () => {
        source?.close();
        failures.current += 1;
        setState(navigator.onLine ? "polling" : "offline");
        if (navigator.onLine) startPolling();
        const delay = Math.min(pollMs * 4, 1_000 * 2 ** Math.min(failures.current, 6));
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(connect, delay);
      };
    };

    const onOnline = () => {
      failures.current = 0;
      pollFailures.current = 0;
      void safeRefresh().catch(() => undefined);
      connect();
    };
    const onOffline = () => {
      source?.close();
      stopPolling();
      setState("offline");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void safeRefresh().catch(() => undefined);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    connect();

    return () => {
      stopped = true;
      source?.close();
      stopPolling();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollMs, safeRefresh]);

  return { state, label: connectionLabels[state], refresh: safeRefresh };
}
