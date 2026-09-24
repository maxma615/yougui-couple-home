"use client";

import { Cloud, CloudOff, RefreshCw } from "lucide-react";

import type { ConnectionState } from "@/hooks/use-home-updates";

export function ConnectionStatus({ state, label }: { state: ConnectionState; label: string }) {
  const Icon = state === "offline" ? CloudOff : state === "live" ? Cloud : RefreshCw;
  return (
    <div className={`connection-status connection-status--${state}`} role="status" title={label}>
      <Icon className={state === "connecting" ? "spin" : undefined} size={15} />
      <span>{label}</span>
    </div>
  );
}

