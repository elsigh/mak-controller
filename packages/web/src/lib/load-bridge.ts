import type { HistoryDay, HistoryResponse, Recipe, StatusResponse } from "@makgrill/shared";
import { bridgeFetch } from "./bridge";

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await bridgeFetch(path);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function loadStatus() {
  return getJson<StatusResponse | null>("/internal/status", null);
}

export function loadRecipes() {
  return getJson<Recipe[]>("/internal/recipes", []);
}

export function loadSessions() {
  return getJson<
    Array<{ id: number; name: string; started_at: string; ended_at: string | null; active: number }>
  >("/internal/sessions", []);
}

export function loadDays() {
  return getJson<HistoryDay[]>("/internal/days", []);
}

export function loadHistory(query?: number | null | { sessionId?: number | null; day?: string | null }) {
  const params = new URLSearchParams();
  if (query && typeof query === "object") {
    if (query.day) params.set("day", query.day);
    else if (query.sessionId) params.set("sessionId", String(query.sessionId));
  } else if (query) {
    params.set("sessionId", String(query));
  }
  const search = params.toString();
  return getJson<HistoryResponse>(search ? `/internal/history?${search}` : "/internal/history", {
    timestamps: [],
    grill_temp: [],
    setpoint: [],
    probe1: [],
    probe2: [],
    probe3: [],
  });
}
