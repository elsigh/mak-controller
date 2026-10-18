export type ProbeKey = "probe1" | "probe2" | "probe3";

export type TriggerType = "time" | "probe1" | "probe2" | "probe3" | "hold";
export type TriggerCond = "gte" | "lte";

export interface RecipeStage {
  name: string;
  setpoint: number;
  trigger_type: TriggerType;
  trigger_cond: TriggerCond;
  trigger_val: number;
}

export interface Recipe {
  id: number;
  name: string;
  stages: RecipeStage[];
}

export interface GrillCommand {
  /**
   * Commanded pit setpoint (°F), or `null` while the bridge is NOT commanding
   * one: the user has not set a setpoint for the current cook in the app/API
   * (or a recipe). The grill keeps whatever was set on its own panel.
   */
  setPoint: number | null;
  potStatus: string;
  cookMode: number;
  zoneProbe: number;
  power: 0 | 1;
}

export interface GrillState {
  grill_id: string;
  temp: string;
  power: string;
  probe1: string;
  probe2: string;
  probe3: string;
  flags: string;
  last_seen: string;
}

export interface CookSession {
  id: number;
  name: string;
  started_at: string;
  ended_at?: string | null;
  active?: number;
}

export interface AutomationStatus {
  active: boolean;
  name: string;
  stage_idx: number;
  total_stages: number;
  stage_elapsed_sec: number;
  current_stage: RecipeStage | null;
}

/** Result of the most recent ntfy publish attempt (any alert). */
export interface NtfyAlertStatus {
  /** ISO timestamp when the send started. */
  at: string;
  title: string;
  priority: string;
  ok: boolean;
  /** Last HTTP status from ntfy, or null for network errors / no topic. */
  status: number | null;
  error: string | null;
  attempts: number;
}

export interface StatusResponse {
  state: GrillState;
  command: GrillCommand;
  is_online: boolean;
  is_cooldown: boolean;
  active_session: CookSession | null;
  probe_targets: Record<ProbeKey, number | null>;
  probe_alerts: Record<ProbeKey, boolean>;
  /** True while the current silence episode has been alerted (grill silent while last Power was ON). */
  silence_alerted: boolean;
  /** Whether an ntfy topic is configured on the bridge. */
  ntfy_configured: boolean;
  /** Most recent ntfy send result, or null if nothing was sent since bridge start. */
  last_alert: NtfyAlertStatus | null;
  at_set: boolean;
  automation: AutomationStatus;
  /** Resolved header title; never blank (falls back to FALLBACK_GRILL_NAME). */
  grill_name: string;
  /** How the bridge answers polls while `command.setPoint` is null. */
  uncommanded_reply: UncommandedReplyMode;
}

/** Settings persisted on the bridge (`settings` SQLite table). */
export interface SettingsResponse {
  ntfy_topic: string;
  grill_id: string;
  /** Editable override for the current grill (empty = use product fallback). */
  grill_name: string;
  /** Header title after fallback; never blank. */
  grill_display_name: string;
}

export interface HistoryDay {
  day: string;
  samples: number;
  first_timestamp: string;
  last_timestamp: string;
}

export interface HistoryResponse {
  timestamps: string[];
  grill_temp: Array<number | null>;
  setpoint: Array<number | null>;
  probe1: Array<number | null>;
  probe2: Array<number | null>;
  probe3: Array<number | null>;
  day?: string | null;
  sample_count?: number;
  downsample_seconds?: number | null;
}

/** Studio / box local calendar for day-grouped history. */
export const HISTORY_TIMEZONE = "America/Los_Angeles";
/** Chart display cadence. CSV / dense queries stay at native ~4s poll resolution. */
export const HISTORY_CHART_DOWNSAMPLE_SECONDS = 20;
/** Unnamed telemetry (session_id null) is kept at least this long so yesterday stays in History. */
export const VOLATILE_RETENTION_DAYS = 14;

const HISTORY_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidHistoryDay(day: string): boolean {
  const match = HISTORY_DAY_RE.exec(day);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, date));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === date;
}

export function localCalendarDay(now: Date = new Date(), timeZone = HISTORY_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(day: string, delta: number): string {
  const match = HISTORY_DAY_RE.exec(day);
  if (!match) return day;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta));
  return utc.toISOString().slice(0, 10);
}

export function nextCalendarDay(day: string): string {
  return addCalendarDays(day, 1);
}

export function formatHistoryDayLabel(day: string, now: Date = new Date(), timeZone = HISTORY_TIMEZONE): string {
  const today = localCalendarDay(now, timeZone);
  if (day === today) return "Today";
  if (day === addCalendarDays(today, -1)) return "Yesterday";
  const match = HISTORY_DAY_RE.exec(day);
  if (!match) return day;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Local wall-clock stamp matching telemetry rows: `YYYY-MM-DD HH:MM:SS`. */
export function formatLocalStamp(now: Date = new Date(), timeZone = HISTORY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

export function timeOfDaySeconds(stamp: string): number {
  const time = String(stamp).split(/[ T]/)[1] ?? "00:00:00";
  const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Keep the first row in each time bucket, plus the last sample. */
export function downsampleByTime<T extends { timestamp: string }>(rows: T[], intervalSeconds: number): T[] {
  if (intervalSeconds <= 0 || rows.length <= 2) return rows;
  const kept: T[] = [];
  let bucket = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const nextBucket = Math.floor(timeOfDaySeconds(row.timestamp) / intervalSeconds);
    if (nextBucket !== bucket) {
      kept.push(row);
      bucket = nextBucket;
    }
  }
  const last = rows[rows.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

export interface FlagEvent {
  timestamp: string;
  field_name: string;
  old_val: string;
  new_val: string;
  bit_diff: string;
  context: string;
}

export const SETPOINT_MIN = 150;
export const SETPOINT_MAX = 500;
export const SETPOINT_STEP = 5;
export const ONLINE_WINDOW_MS = 15_000;
/**
 * Stage 2 after the 15s UI-offline window: one urgent ntfy per silence episode
 * (last Power ON only). Silence NEVER changes commanded power.
 */
export const SILENCE_THRESHOLD_MS = 30_000;
export const SILENCE_WATCHDOG_INTERVAL_MS = 5_000;

export const KNOWN_GRILL_POST_KEYS = [
  "GrillId",
  "Temp",
  "Power",
  "Probe1",
  "Probe2",
  "Probe3",
  "GrillFlags",
] as const;

export const DANGER_TOKENS = ["FIRE", "FLAMEOUT", "FLAME OUT", "TIMEOUT", "TIME OUT"] as const;

/**
 * Placeholder setpoint for the wire format when one is required but the user
 * has not chosen one (only an explicit user power-off reply). Never sent as a
 * real temperature command.
 */
export const FALLBACK_SETPOINT = 175;

/**
 * How the bridge answers a grill POST while it is not commanding a setpoint
 * (see PROTOCOL.md "Setpoint ownership").
 *  - `hold`   (default): HTTP 503, empty body. No command at all, the same as
 *    the server being briefly unreachable, which the grill rides through on
 *    its own panel setpoint.
 *  - `omit`:  HTTP 200 with the quoted string minus the `setPoint` key.
 *    Untested against Pellet Boss firmware.
 *  - `legacy`: HTTP 200 with `setPoint=175` (pre-2026-10-17 behavior; this
 *    overwrites a panel setpoint).
 */
export type UncommandedReplyMode = "hold" | "omit" | "legacy";
export const UNCOMMANDED_REPLY_MODES: readonly UncommandedReplyMode[] = ["hold", "omit", "legacy"];

export function parseUncommandedReplyMode(raw: string | null | undefined): UncommandedReplyMode {
  const value = String(raw ?? "").trim().toLowerCase();
  return (UNCOMMANDED_REPLY_MODES as readonly string[]).includes(value)
    ? (value as UncommandedReplyMode)
    : "hold";
}

/**
 * A grill gap at least this long ends the current cook: the next poll starts
 * a new grill session and the old app setpoint is not resurrected onto it.
 * Routine grill Wi-Fi drops are 30s to ~3 minutes and stay well under this.
 */
export const NEW_COOK_GAP_MS = 30 * 60 * 1000;

export const DEFAULT_COMMAND: GrillCommand = {
  setPoint: null,
  potStatus: "",
  cookMode: 1,
  zoneProbe: 1,
  power: 1,
};

export const UNKNOWN_GRILL_ID = "Unknown";
/** In-app header fallback when no grillId → name override is set. */
export const FALLBACK_GRILL_NAME = "MakGrill";

export const DEFAULT_STATE: GrillState = {
  grill_id: UNKNOWN_GRILL_ID,
  temp: "--",
  power: "OFF",
  probe1: "",
  probe2: "",
  probe3: "",
  flags: "",
  last_seen: "Waiting for data...",
};

export function isKnownGrillId(grillId: string | null | undefined): boolean {
  const id = String(grillId ?? "").trim();
  return id !== "" && id !== UNKNOWN_GRILL_ID;
}

/** Header title: per-id override, else provisional (offline) name, else MakGrill. */
export function resolveGrillDisplayName(input: {
  grillId: string | null | undefined;
  names?: Record<string, string> | null;
  provisional?: string | null;
}): string {
  const id = String(input.grillId ?? "").trim();
  const names = input.names ?? {};
  if (isKnownGrillId(id)) {
    const named = names[id]?.trim();
    if (named) return named;
  }
  const provisional = input.provisional?.trim();
  return provisional || FALLBACK_GRILL_NAME;
}

export const DEFAULT_RECIPES: Array<{ name: string; stages: RecipeStage[] }> = [
  {
    name: "Pork Shoulder / Brisket (Stall, Wrap & Rest)",
    stages: [
      { name: "Initial Smoke", setpoint: 200, trigger_type: "probe1", trigger_cond: "gte", trigger_val: 165 },
      { name: "Bark & Finish", setpoint: 250, trigger_type: "probe1", trigger_cond: "gte", trigger_val: 203 },
      { name: "Cool Down to Slice", setpoint: 150, trigger_type: "probe1", trigger_cond: "lte", trigger_val: 150 },
      { name: "Safe Hold", setpoint: 150, trigger_type: "hold", trigger_cond: "gte", trigger_val: 0 },
    ],
  },
  {
    name: "3-2-1 Ribs",
    stages: [
      { name: "Initial Smoke", setpoint: 225, trigger_type: "time", trigger_cond: "gte", trigger_val: 180 },
      { name: "Wrapped / Tenderize", setpoint: 250, trigger_type: "time", trigger_cond: "gte", trigger_val: 120 },
      { name: "Sauce & Set Glaze", setpoint: 225, trigger_type: "time", trigger_cond: "gte", trigger_val: 60 },
      { name: "Keep Warm", setpoint: 170, trigger_type: "hold", trigger_cond: "gte", trigger_val: 0 },
    ],
  },
  {
    name: "Reverse Sear Steak",
    stages: [
      { name: "Gentle Smoke", setpoint: 225, trigger_type: "probe1", trigger_cond: "gte", trigger_val: 115 },
      { name: "High Heat Sear", setpoint: 450, trigger_type: "probe1", trigger_cond: "gte", trigger_val: 130 },
    ],
  },
];

export function clampSetpoint(temp: number): number {
  if (!Number.isFinite(temp)) {
    return FALLBACK_SETPOINT;
  }
  const stepped = Math.round(temp / SETPOINT_STEP) * SETPOINT_STEP;
  return Math.min(SETPOINT_MAX, Math.max(SETPOINT_MIN, stepped));
}

export function isValidSetpoint(temp: number): boolean {
  return (
    Number.isInteger(temp) &&
    temp >= SETPOINT_MIN &&
    temp <= SETPOINT_MAX &&
    temp % SETPOINT_STEP === 0
  );
}

export function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === "" || text === "--") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Full quoted reply. A null setpoint is written as FALLBACK_SETPOINT. */
export function encodeGrillResponse(command: GrillCommand): string {
  const setPoint = command.setPoint ?? FALLBACK_SETPOINT;
  return `"setPoint=${setPoint}&potStatus=${command.potStatus}&cookMode=${command.cookMode}&zoneProbe=${command.zoneProbe}&power=${command.power}"`;
}

/** Quoted reply without the `setPoint` key (UNCOMMANDED_REPLY=omit). */
export function encodeGrillResponseWithoutSetpoint(command: GrillCommand): string {
  return `"potStatus=${command.potStatus}&cookMode=${command.cookMode}&zoneProbe=${command.zoneProbe}&power=${command.power}"`;
}

/** Reported Power values that mean the grill is shutting down or off. */
export function isOffOrCooldownPower(reported: string): boolean {
  const upper = String(reported ?? "").trim().toUpperCase();
  return upper === "" || upper === "OFF" || upper.includes("COOL") || upper === "CD";
}

/**
 * Does this poll begin a new cook relative to the previous one? Used only to
 * drop an app setpoint (or recipe) that belongs to an earlier cook; a new cook
 * means "stop commanding", never "command something else".
 *  - the grill reports START after reporting anything else (fresh ignition),
 *  - the previous poll was OFF / cooldown and the grill is now running again,
 *  - or the grill was silent for NEW_COOK_GAP_MS or longer.
 * Routine Wi-Fi drops (ON → gap of minutes → ON) are not a new cook.
 */
export function detectNewCook(input: {
  previousPower: string | null;
  previousSeenEpoch: number;
  power: string;
  now: number;
}): string | null {
  if (input.previousSeenEpoch <= 0 || input.previousPower === null) return "first poll since bridge start";
  const prev = input.previousPower.trim().toUpperCase();
  const cur = input.power.trim().toUpperCase();
  const gap = input.now - input.previousSeenEpoch;
  if (gap >= NEW_COOK_GAP_MS) return `grill silent for ${Math.round(gap / 60_000)} min`;
  if (cur === "START" && prev !== "START") return `Power ${prev || "(empty)"} → START`;
  if (isOffOrCooldownPower(prev) && !isOffOrCooldownPower(cur)) return `Power ${prev || "(empty)"} → ${cur}`;
  return null;
}

export function isCooldownPower(reported: string): boolean {
  const upper = reported.toUpperCase();
  return upper.includes("COOL") || upper === "CD";
}

export function isOfflinePower(reported: string): boolean {
  return reported.toUpperCase() === "OFF";
}

/**
 * After a user-initiated power=0 (cooldown / power off), once the grill
 * acknowledges with COOL/CD/OFF, reset commanded power to 1 (upstream
 * behavior). This is the only automatic power transition and it only ever
 * moves 0 → 1; MakGrill never automatically answers power=0.
 */
export function shouldResetCommandedPower(commandedPower: number, reported: string): boolean {
  return commandedPower === 0 && (isCooldownPower(reported) || isOfflinePower(reported));
}

export function isReportedOn(reported: string): boolean {
  return reported.toUpperCase() === "ON";
}

export function isActiveCookPower(reported: string): boolean {
  const upper = reported.toUpperCase();
  return upper === "ON" || isCooldownPower(upper);
}

export function containsDangerToken(text: string): boolean {
  const upper = text.toUpperCase();
  return DANGER_TOKENS.some((token) => upper.includes(token));
}

/** Watch silence only when the last POST reported Power ON. Skip COOLDOWN/COOL/CD/OFF. */
export function shouldWatchSilence(input: {
  lastSeenEpoch: number;
  lastReportedPower: string;
  sessionActive?: boolean;
}): boolean {
  if (input.lastSeenEpoch <= 0) return false;
  return isReportedOn(input.lastReportedPower);
}

export function isSustainedSilence(
  lastSeenEpoch: number,
  now: number,
  thresholdMs = SILENCE_THRESHOLD_MS,
): boolean {
  return lastSeenEpoch > 0 && now - lastSeenEpoch >= thresholdMs;
}

export function unknownGrillPostKeys(
  form: Record<string, string>,
  alreadySeen: Iterable<string> = [],
): string[] {
  const known = new Set<string>(KNOWN_GRILL_POST_KEYS);
  const seen = new Set(alreadySeen);
  const unknown: string[] = [];
  for (const key of Object.keys(form)) {
    if (!known.has(key) && !seen.has(key)) unknown.push(key);
  }
  return unknown;
}

export function computeOnline(lastSeenEpoch: number, now = Date.now()): boolean {
  return lastSeenEpoch > 0 && now - lastSeenEpoch < ONLINE_WINDOW_MS;
}

export function computeCooldown(
  isOnline: boolean,
  reportedPower: string,
  commandedPower: number,
): boolean {
  if (!isOnline) return false;
  const upper = reportedPower.toUpperCase();
  return isCooldownPower(upper) || (commandedPower === 0 && upper !== "OFF");
}

export function analyzeBitmaskDiff(oldVal: string | null, newVal: string): string {
  try {
    const oldNum = oldVal ? parseInt(oldVal, 0) || 0 : 0;
    const newNum = parseInt(newVal, 0) || 0;
    const diff = oldNum ^ newNum;
    const bits: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      if (diff & (1 << i)) {
        bits.push(`Bit ${i} (${newNum & (1 << i) ? "HIGH" : "LOW"})`);
      }
    }
    const binary = newNum.toString(2).padStart(8, "0");
    return `Bin: ${binary} | Toggled: ${bits.length ? bits.join(", ") : "None"}`;
  } catch {
    return "Non-integer payload change";
  }
}

export function formatStageRule(stage: RecipeStage): string {
  if (stage.trigger_type === "hold") {
    return "Hold indefinitely until stopped";
  }
  if (stage.trigger_type === "time") {
    return `After ${stage.trigger_val} minutes in this stage`;
  }
  const cond = stage.trigger_cond === "lte" ? "drops to" : "reaches";
  return `When ${stage.trigger_type.toUpperCase()} ${cond} ${stage.trigger_val}°F`;
}
