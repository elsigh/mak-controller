import type { HistoryResponse, Recipe, RecipeStage, StatusResponse } from "@makgrill/shared";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => json<StatusResponse>("/api/status"),
  history: (sessionId?: number | null) =>
    json<HistoryResponse>(sessionId ? `/api/history?sessionId=${sessionId}` : "/api/history"),
  setSetpoint: (temp: number) => json("/api/setpoint", { method: "POST", body: JSON.stringify({ temp }) }),
  setPower: (state: 0 | 1) => json("/api/power", { method: "POST", body: JSON.stringify({ state }) }),
  setProbeTarget: (probe: string, target: number | null) =>
    json("/api/probe-target", { method: "POST", body: JSON.stringify({ probe, target }) }),
  startSession: (name: string) => json("/api/session/start", { method: "POST", body: JSON.stringify({ name }) }),
  stopSession: () => json("/api/session/stop", { method: "POST" }),
  sessions: () => json<Array<{ id: number; name: string; started_at: string; ended_at: string | null; active: number }>>("/api/sessions"),
  recipes: () => json<Recipe[]>("/api/recipes"),
  saveRecipe: (payload: { id?: number | null; name: string; stages: RecipeStage[] }) =>
    json<{ success: boolean; id: number }>("/api/recipes", { method: "POST", body: JSON.stringify(payload) }),
  deleteRecipe: (id: number) => json(`/api/recipes/${id}`, { method: "DELETE" }),
  startAutomation: (name: string, stages: RecipeStage[]) =>
    json("/api/automation/start", { method: "POST", body: JSON.stringify({ name, stages }) }),
  stopAutomation: () => json("/api/automation/stop", { method: "POST" }),
  nextStage: () => json("/api/automation/next", { method: "POST" }),
  settings: () => json<{ ntfy_topic: string }>("/api/settings"),
  saveSettings: (ntfy_topic: string) =>
    json("/api/settings", { method: "POST", body: JSON.stringify({ ntfy_topic }) }),
  testNtfy: () => json("/api/settings/test-ntfy", { method: "POST" }),
  flagEvents: () =>
    json<Array<{ timestamp: string; field_name: string; old_val: string; new_val: string; bit_diff: string; context: string }>>(
      "/api/flag-events",
    ),
  prune: (days: number) => json("/api/maintenance/prune", { method: "POST", body: JSON.stringify({ days }) }),
};
