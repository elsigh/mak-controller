import { Hono } from "hono";
import { clampSetpoint, isValidHistoryDay } from "@makgrill/shared";
import type { ProbeKey, RecipeStage } from "@makgrill/shared";
import { requireBridgeSecret } from "../auth.ts";
import {
  deleteRecipe,
  exportDayRows,
  exportSessionRows,
  getSetting,
  listFlagEvents,
  listHistoryDays,
  listRecipes,
  listSessions,
  pruneDatabase,
  setSetting,
  upsertRecipe,
} from "../db.ts";
import { sendNtfy } from "../ntfy.ts";
import type { GrillRuntime } from "../runtime.ts";

const PROBES = new Set<ProbeKey>(["probe1", "probe2", "probe3"]);

function csvCell(cell: unknown): string {
  const value = cell ?? "";
  return /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
}

function csvAttachment(
  c: { body: (data: string, status: 200, headers: Record<string, string>) => Response },
  rows: Array<{
    timestamp: string;
    grill_temp: number | null;
    setpoint: number | null;
    probe1: number | null;
    probe2: number | null;
    probe3: number | null;
    power: string;
    grill_flags: string;
  }>,
  filename: string,
) {
  const header = "Timestamp,Grill Temp,SetPoint,Probe 1,Probe 2,Probe 3,Power,GrillFlags";
  const lines = rows.map((row) =>
    [row.timestamp, row.grill_temp, row.setpoint, row.probe1, row.probe2, row.probe3, row.power, row.grill_flags]
      .map(csvCell)
      .join(","),
  );
  return c.body([header, ...lines].join("\n"), 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment;filename=${filename}`,
  });
}

function asStages(value: unknown): RecipeStage[] {
  if (!Array.isArray(value)) return [];
  return value.map((stage, index) => ({
    name: String(stage?.name || `Stage ${index + 1}`),
    setpoint: clampSetpoint(Number(stage?.setpoint)),
    trigger_type: stage?.trigger_type === "hold" || String(stage?.trigger_type || "").startsWith("probe")
      ? stage.trigger_type
      : stage?.trigger_type === "time"
        ? "time"
        : "time",
    trigger_cond: stage?.trigger_cond === "lte" ? "lte" : "gte",
    trigger_val: Number(stage?.trigger_val) || 0,
  }));
}

export function internalRoutes(runtime: GrillRuntime) {
  const app = new Hono();
  app.use("*", requireBridgeSecret);

  app.get("/status", (c) => c.json(runtime.getStatus()));

  app.post("/setpoint", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const temp = Number(body.temp ?? new URL(c.req.url).searchParams.get("temp"));
    if (!Number.isFinite(temp)) {
      return c.json({ success: false, error: "Invalid temp" }, 400);
    }
    const command = runtime.setSetpoint(temp);
    return c.json({ success: true, setPoint: command.setPoint });
  });

  app.post("/power", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const raw = body.state ?? new URL(c.req.url).searchParams.get("state");
    const state = Number(raw);
    if (state !== 0 && state !== 1) {
      return c.json({ success: false, error: "Invalid state" }, 400);
    }
    const result = runtime.setPower(state);
    if (!result.ok) return c.json({ success: false, error: result.error }, 400);
    return c.json({ success: true, power: result.power });
  });

  app.post("/probe-target", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const url = new URL(c.req.url);
    const probe = String(body.probe ?? url.searchParams.get("probe") ?? "") as ProbeKey;
    const raw = body.target ?? url.searchParams.get("target");
    if (!PROBES.has(probe)) {
      return c.json({ success: false, error: "Invalid probe key" }, 400);
    }
    const target = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    if (target !== null && !Number.isFinite(target)) {
      return c.json({ success: false, error: "Invalid target" }, 400);
    }
    return c.json({ success: true, ...runtime.setProbeTarget(probe, target) });
  });

  app.get("/history", (c) => {
    const day = c.req.query("day");
    if (day) {
      if (!isValidHistoryDay(day)) {
        return c.json({ error: "Invalid day. Use YYYY-MM-DD." }, 400);
      }
      const dense = c.req.query("dense") === "1" || c.req.query("dense") === "true";
      return c.json(runtime.history({ day, dense }));
    }
    const sessionId = Number(c.req.query("sessionId") ?? c.req.query("id") ?? "") || null;
    return c.json(runtime.history({ sessionId }));
  });

  app.get("/days", (c) => c.json(listHistoryDays()));

  app.get("/flag-events", (c) => c.json(listFlagEvents()));

  app.get("/sessions", (c) => c.json(listSessions()));

  app.post("/session/start", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name ?? c.req.query("name") ?? "Cook Session").trim() || "Cook Session";
    return c.json({ success: true, session: runtime.beginSession(name) });
  });

  app.post("/session/stop", (c) => {
    runtime.endSession();
    return c.json({ success: true });
  });

  app.get("/session/export", (c) => {
    const sessionId = Number(c.req.query("id"));
    if (!sessionId) return c.text("Session ID required", 400);
    return csvAttachment(c, exportSessionRows(sessionId), `cook_session_${sessionId}.csv`);
  });

  app.get("/history/export", (c) => {
    const day = c.req.query("day") ?? "";
    if (!isValidHistoryDay(day)) return c.text("Day required as YYYY-MM-DD", 400);
    return csvAttachment(c, exportDayRows(day), `cook_day_${day}.csv`);
  });

  app.get("/recipes", (c) => c.json(listRecipes()));

  app.post("/recipes", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name ?? "Custom Recipe").trim();
    const stages = asStages(body.stages);
    if (!name || stages.length === 0) {
      return c.json({ success: false, error: "Name and stages required" }, 400);
    }
    const id = upsertRecipe(body.id ? Number(body.id) : null, name, stages);
    return c.json({ success: true, id });
  });

  app.delete("/recipes/:id", (c) => {
    deleteRecipe(Number(c.req.param("id")));
    return c.json({ success: true });
  });

  app.post("/automation/start", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const stages = asStages(body.stages);
    if (!stages.length) return c.json({ success: false, error: "No stages defined" }, 400);
    runtime.startAutomation(String(body.name ?? "Custom Recipe"), stages);
    return c.json({ success: true });
  });

  app.post("/automation/stop", (c) => {
    runtime.stopAutomation();
    return c.json({ success: true });
  });

  app.post("/automation/next", (c) => {
    runtime.skipAutomationStage();
    return c.json({ success: true });
  });

  app.get("/settings", (c) => c.json({ ntfy_topic: runtime.getNtfyTopic() || getSetting("ntfy_topic") }));

  app.post("/settings", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if ("ntfy_topic" in body) {
      const topic = String(body.ntfy_topic ?? "").trim();
      runtime.setNtfyTopic(topic);
      setSetting("ntfy_topic", topic);
    }
    return c.json({ success: true, settings: { ntfy_topic: runtime.getNtfyTopic() } });
  });

  app.post("/settings/test-ntfy", async (c) => {
    const topic = runtime.getNtfyTopic().trim();
    if (!topic) return c.json({ success: false, error: "No ntfy topic configured" }, 400);
    await sendNtfy(topic, "MakGrill Test", "If you see this, push notifications are working!");
    return c.json({ success: true });
  });

  app.post("/maintenance/prune", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const days = Number(body.days ?? c.req.query("days") ?? 30) || 30;
    const result = pruneDatabase(days);
    return c.json({ success: true, ...result });
  });

  return app;
}
