"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, errorMessage } from "@/components/api-client";

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!path) return;
    const id = ++requestId.current;
    try {
      const next = await apiRequest<T>(path);
      if (id === requestId.current) {
        setData(next);
        setError(null);
      }
    } catch (requestError) {
      if (id === requestId.current) setError(errorMessage(requestError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(Boolean(path));
    void refresh();
  }, [path, refresh]);

  useEffect(() => {
    const listener = () => void refresh();
    window.addEventListener("home-data-changed", listener);
    return () => window.removeEventListener("home-data-changed", listener);
  }, [refresh]);

  return { data, setData, loading, error, refresh };
}

