"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiError, apiRequest, errorMessage } from "@/components/api-client";
import type { SessionData } from "@/components/home-types";

type SessionContextValue = {
  session: SessionData | null;
  loading: boolean;
  error: string | null;
  refreshSession: () => Promise<boolean>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children, requireHome = true }: { children: ReactNode; requireHome?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const next = await apiRequest<SessionData>("/api/session");
      setSession(next);
      setError(null);
      if (requireHome && !next.home) router.replace("/setup");
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        router.replace("/login");
      } else {
        setError(errorMessage(requestError));
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [requireHome, router]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo(
    () => ({ session, loading, error, refreshSession }),
    [session, loading, error, refreshSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession 必须在 SessionProvider 中使用");
  return context;
}
