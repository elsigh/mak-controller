import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  DEFAULT_RECIPES,
  HISTORY_CHART_DOWNSAMPLE_SECONDS,
  VOLATILE_RETENTION_DAYS,
  downsampleByTime,
  formatLocalStamp,
  isValidHistoryDay,
  nextCalendarDay,
} from "@makgrill/shared";
import type { CookSession, FlagEvent, HistoryDay, HistoryResponse, Recipe, RecipeStage } from "@makgrill/shared";
import { config, log } from "./config.ts";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function initDb(seedNtfyTopic = ""): string {
  const conn = getDb();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      timestamp TEXT NOT NULL,
      grill_temp REAL,
      setpoint REAL,
      probe1 REAL,
      probe2 REAL,
      probe3 REAL,
      power TEXT,
      grill_flags TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS flag_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      field_name TEXT NOT NULL,
      old_val TEXT,
      new_val TEXT,
      bit_diff TEXT,
      context TEXT
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      stages_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp);
    CREATE INDEX IF NOT EXISTS idx_telemetry_session_id ON telemetry(session_id);
  `);

  const existingTopic = conn.prepare("SELECT value FROM settings WHERE key = 'ntfy_topic'").get() as
    | { value: string }
    | undefined;
  let topic = existingTopic?.value ?? "";
  if (!topic && seedNtfyTopic) {
    conn.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ntfy_topic', ?)").run(seedNtfyTopic);
    topic = seedNtfyTopic;
  }

  const count = (conn.prepare("SELECT COUNT(*) AS n FROM recipes").get() as { n: number }).n;
  if (count === 0) {
    const insert = conn.prepare("INSERT INTO recipes (name, stages_json) VALUES (?, ?)");
    for (const recipe of DEFAULT_RECIPES) {
      insert.run(recipe.name, JSON.stringify(recipe.stages));
    }
  }

  log("INFO", `Database initialized at ${config.dbPath} (WAL). NTFY topic: '${topic}'`);
  return topic;
}

export function getSetting(key: string): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

export function setSetting(key: string, value: string): void {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function insertTelemetry(row: {
  sessionId: number | null;
  timestamp: string;
  grillTemp: number | null;
  setpoint: number | null;
  probe1: number | null;
  probe2: number | null;
  probe3: number | null;
  power: string;
  flags: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO telemetry
        (session_id, timestamp, grill_temp, setpoint, probe1, probe2, probe3, power, grill_flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.sessionId,
      row.timestamp,
      row.grillTemp,
      row.setpoint,
      row.probe1,
      row.probe2,
      row.probe3,
      row.power,
      row.flags,
    );
}

export function insertFlagEvent(event: {
  timestamp: string;
  fieldName: string;
  oldVal: string;
  newVal: string;
  bitDiff: string;
  context: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO flag_events (timestamp, field_name, old_val, new_val, bit_diff, context)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(event.timestamp, event.fieldName, event.oldVal, event.newVal, event.bitDiff, event.context);
}

export function getActiveSession(): CookSession | null {
  const row = getDb()
    .prepare("SELECT id, name, started_at, ended_at, active FROM sessions WHERE active = 1 ORDER BY id DESC LIMIT 1")
    .get() as CookSession | undefined;
  return row ?? null;
}

export function listSessions(): CookSession[] {
  return getDb()
    .prepare("SELECT id, name, started_at, ended_at, active FROM sessions ORDER BY id DESC LIMIT 100")
    .all() as CookSession[];
}

export function startSession(name: string, now: string): CookSession {
  const conn = getDb();
  conn.prepare("UPDATE sessions SET active = 0, ended_at = ? WHERE active = 1").run(now);
  const info = conn.prepare("INSERT INTO sessions (name, started_at, active) VALUES (?, ?, 1)").run(name, now);
  return { id: Number(info.lastInsertRowid), name, started_at: now, ended_at: null, active: 1 };
}

export function stopActiveSession(now: string): void {
  getDb().prepare("UPDATE sessions SET active = 0, ended_at = ? WHERE active = 1").run(now);
}

type HistoryRow = {
  timestamp: string;
  grill_temp: number | null;
  setpoint: number | null;
  probe1: number | null;
  probe2: number | null;
  probe3: number | null;
};

export type TelemetryExportRow = HistoryRow & {
  power: string;
  grill_flags: string;
};

function toHistoryResponse(
  rows: HistoryRow[],
  extras: Pick<HistoryResponse, "day" | "sample_count" | "downsample_seconds"> = {},
): HistoryResponse {
  return {
    timestamps: rows.map((row) => String(row.timestamp).split(/[ T]/).at(-1) ?? String(row.timestamp)),
    grill_temp: rows.map((row) => row.grill_temp ?? null),
    setpoint: rows.map((row) => row.setpoint ?? null),
    probe1: rows.map((row) => row.probe1 ?? null),
    probe2: rows.map((row) => row.probe2 ?? null),
    probe3: rows.map((row) => row.probe3 ?? null),
    ...extras,
  };
}

export function getHistory(sessionId: number | null): HistoryResponse {
  const conn = getDb();
  const rows = sessionId
    ? (conn
        .prepare(
          `SELECT timestamp, grill_temp, setpoint, probe1, probe2, probe3
           FROM telemetry WHERE session_id = ? ORDER BY id ASC`,
        )
        .all(sessionId) as HistoryRow[])
    : (conn
        .prepare(
          `SELECT timestamp, grill_temp, setpoint, probe1, probe2, probe3
           FROM telemetry ORDER BY id DESC LIMIT 500`,
        )
        .all() as HistoryRow[]).reverse();

  return toHistoryResponse(rows, { sample_count: rows.length, downsample_seconds: null });
}

/**
 * Day history uses Studio-local calendar dates (America/Los_Angeles / box TZ).
 * Timestamps are stored as `YYYY-MM-DD HH:MM:SS` in that zone.
 * Chart responses downsample to 1 point / 20s (~4.3k pts for a full day at 4s polls).
 * Pass downsampleSeconds = 0 for native resolution (CSV / dense=1).
 */
export function getHistoryByDay(
  day: string,
  downsampleSeconds: number = HISTORY_CHART_DOWNSAMPLE_SECONDS,
): HistoryResponse {
  if (!isValidHistoryDay(day)) {
    return toHistoryResponse([], { day, sample_count: 0, downsample_seconds: null });
  }
  const rows = getDb()
    .prepare(
      `SELECT timestamp, grill_temp, setpoint, probe1, probe2, probe3
       FROM telemetry
       WHERE timestamp >= ? AND timestamp < ?
       ORDER BY id ASC`,
    )
    .all(`${day} 00:00:00`, `${nextCalendarDay(day)} 00:00:00`) as HistoryRow[];
  const displayed = downsampleSeconds > 0 ? downsampleByTime(rows, downsampleSeconds) : rows;
  return toHistoryResponse(displayed, {
    day,
    sample_count: rows.length,
    downsample_seconds: displayed.length < rows.length ? downsampleSeconds : null,
  });
}

export function listHistoryDays(): HistoryDay[] {
  return getDb()
    .prepare(
      `SELECT substr(timestamp, 1, 10) AS day,
              COUNT(*) AS samples,
              MIN(timestamp) AS first_timestamp,
              MAX(timestamp) AS last_timestamp
       FROM telemetry
       GROUP BY substr(timestamp, 1, 10)
       ORDER BY day DESC`,
    )
    .all() as HistoryDay[];
}

export function listFlagEvents(limit = 20): FlagEvent[] {
  return getDb()
    .prepare(
      `SELECT timestamp, field_name, old_val, new_val, bit_diff, context
       FROM flag_events ORDER BY id DESC LIMIT ?`,
    )
    .all(limit)
    .map((row) => {
      const r = row as FlagEvent;
      return { ...r, timestamp: String(r.timestamp).split(" ").at(-1) ?? r.timestamp };
    });
}

export function listRecipes(): Recipe[] {
  return getDb()
    .prepare("SELECT id, name, stages_json FROM recipes ORDER BY id ASC")
    .all()
    .map((row) => {
      const r = row as { id: number; name: string; stages_json: string };
      return { id: r.id, name: r.name, stages: JSON.parse(r.stages_json) as RecipeStage[] };
    });
}

export function upsertRecipe(id: number | null, name: string, stages: RecipeStage[]): number {
  const conn = getDb();
  const json = JSON.stringify(stages);
  if (id) {
    conn.prepare("UPDATE recipes SET name = ?, stages_json = ? WHERE id = ?").run(name, json, id);
    return id;
  }
  const info = conn.prepare("INSERT INTO recipes (name, stages_json) VALUES (?, ?)").run(name, json);
  return Number(info.lastInsertRowid);
}

export function deleteRecipe(id: number): void {
  getDb().prepare("DELETE FROM recipes WHERE id = ?").run(id);
}

export function exportSessionRows(sessionId: number) {
  return getDb()
    .prepare(
      `SELECT timestamp, grill_temp, setpoint, probe1, probe2, probe3, power, grill_flags
       FROM telemetry WHERE session_id = ? ORDER BY id ASC`,
    )
    .all(sessionId) as TelemetryExportRow[];
}

export function exportDayRows(day: string) {
  if (!isValidHistoryDay(day)) return [] as TelemetryExportRow[];
  return getDb()
    .prepare(
      `SELECT timestamp, grill_temp, setpoint, probe1, probe2, probe3, power, grill_flags
       FROM telemetry
       WHERE timestamp >= ? AND timestamp < ?
       ORDER BY id ASC`,
    )
    .all(`${day} 00:00:00`, `${nextCalendarDay(day)} 00:00:00`) as TelemetryExportRow[];
}

export function pruneDatabase(days: number) {
  const conn = getDb();
  const cutoff = formatLocalStamp(new Date(Date.now() - days * 86_400_000));
  // Never drop unnamed day-history sooner than VOLATILE_RETENTION_DAYS, even if
  // the maintenance button asks for a shorter session window.
  const volatileDays = Math.max(days, VOLATILE_RETENTION_DAYS);
  const volatileCutoff = formatLocalStamp(new Date(Date.now() - volatileDays * 86_400_000));

  const prunedVolatile = conn.prepare("DELETE FROM telemetry WHERE session_id IS NULL AND timestamp < ?").run(
    volatileCutoff,
  ).changes;

  const oldSessions = conn
    .prepare("SELECT id FROM sessions WHERE active = 0 AND ended_at IS NOT NULL AND ended_at < ?")
    .all(cutoff) as Array<{ id: number }>;
  const ids = oldSessions.map((s) => s.id);

  let prunedSessionTelemetry = 0;
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    prunedSessionTelemetry = conn.prepare(`DELETE FROM telemetry WHERE session_id IN (${placeholders})`).run(...ids)
      .changes;
    conn.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...ids);
  }

  const prunedFlagEvents = conn.prepare("DELETE FROM flag_events WHERE timestamp < ?").run(cutoff).changes;

  return {
    pruned_volatile: prunedVolatile,
    pruned_session_telemetry: prunedSessionTelemetry,
    pruned_sessions: ids.length,
    pruned_flag_events: prunedFlagEvents,
  };
}
