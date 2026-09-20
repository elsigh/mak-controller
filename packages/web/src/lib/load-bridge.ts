import type { Recipe, StatusResponse } from "@makgrill/shared";
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
