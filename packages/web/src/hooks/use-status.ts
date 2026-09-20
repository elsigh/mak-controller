"use client";

import { useCallback, useEffect, useState } from "react";
import type { StatusResponse } from "@makgrill/shared";
import { api } from "@/lib/api";

export function useStatus(intervalMs = 2500) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lost connection to the bridge");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { status, error, refresh };
}
