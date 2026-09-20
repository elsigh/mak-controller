"use client";

import { useEffect, useState } from "react";
import type { StatusResponse } from "@makgrill/shared";
import { api } from "@/lib/api";

export function useStatus(intervalMs = 2500, initialStatus: StatusResponse | null = null) {
  const [status, setStatus] = useState<StatusResponse | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      void api
        .status()
        .then((data) => {
          if (cancelled) return;
          setStatus(data);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Lost connection to the bridge");
        });
    };

    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  const refresh = async () => {
    try {
      const data = await api.status();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lost connection to the bridge");
    }
  };

  return { status, error, refresh };
}
