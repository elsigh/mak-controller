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
  setPoint: number;
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

export type PowerFailSafeReason = "silence" | "flameout" | "danger" | "offline-off";

export interface StatusResponse {
  state: GrillState;
  command: GrillCommand;
  is_online: boolean;
  is_cooldown: boolean;
  active_session: CookSession | null;
  probe_targets: Record<ProbeKey, number | null>;
  probe_alerts: Record<ProbeKey, boolean>;
  flameout_alert: boolean;
  power_failsafe: boolean;
  power_failsafe_reason: PowerFailSafeReason | null;
  at_set: boolean;
  automation: AutomationStatus;
}

export interface HistoryResponse {
  timestamps: string[];
  grill_temp: Array<number | null>;
  setpoint: Array<number | null>;
  probe1: Array<number | null>;
  probe2: Array<number | null>;
  probe3: Array<number | null>;
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
/** Stage 2 after the 15s UI-offline window: ntfy + command.power = 0. */
export const SILENCE_THRESHOLD_MS = 30_000;
/** Re-notify while still silent; do not fire on every watchdog tick. */
export const SILENCE_RENOTIFY_MS = 3 * 60 * 1000;
export const SILENCE_WATCHDOG_INTERVAL_MS = 5_000;
export const FLAMEOUT_DELTA_F = 35;
export const FLAMEOUT_DURATION_MS = 8 * 60 * 1000;

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

export const POWER_FAILSAFE_LABELS: Record<PowerFailSafeReason, string> = {
  silence: "grill silent / Web Ctrl lost",
  flameout: "software flameout",
  danger: "danger flag",
  "offline-off": "grill reported OFF after a long gap",
};

export const DEFAULT_COMMAND: GrillCommand = {
  setPoint: 175,
  potStatus: "",
  cookMode: 1,
  zoneProbe: 1,
  power: 1,
};

export const DEFAULT_STATE: GrillState = {
  grill_id: "Unknown",
  temp: "--",
  power: "OFF",
  probe1: "",
  probe2: "",
  probe3: "",
  flags: "",
  last_seen: "Waiting for data...",
};

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
    return DEFAULT_COMMAND.setPoint;
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

export function encodeGrillResponse(command: GrillCommand): string {
  return `"setPoint=${command.setPoint}&potStatus=${command.potStatus}&cookMode=${command.cookMode}&zoneProbe=${command.zoneProbe}&power=${command.power}"`;
}

export function isCooldownPower(reported: string): boolean {
  const upper = reported.toUpperCase();
  return upper.includes("COOL") || upper === "CD";
}

export function isOfflinePower(reported: string): boolean {
  return reported.toUpperCase() === "OFF";
}

export function shouldResetCommandedPower(
  commandedPower: number,
  reported: string,
  holdOff = false,
): boolean {
  if (holdOff) return false;
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

export function describePowerFailSafe(reason: PowerFailSafeReason | null | undefined): string {
  if (!reason) return "";
  return POWER_FAILSAFE_LABELS[reason] ?? reason;
}

/** Watch silence when the last POST showed heat/cooldown or a cook session is open. */
export function shouldWatchSilence(input: {
  lastSeenEpoch: number;
  lastReportedPower: string;
  sessionActive: boolean;
}): boolean {
  if (input.lastSeenEpoch <= 0) return false;
  return input.sessionActive || isActiveCookPower(input.lastReportedPower);
}

export function isSustainedSilence(
  lastSeenEpoch: number,
  now: number,
  thresholdMs = SILENCE_THRESHOLD_MS,
): boolean {
  return lastSeenEpoch > 0 && now - lastSeenEpoch >= thresholdMs;
}

/**
 * After a long offline gap, an OFF report must not be answered with power=1
 * unless the user explicitly turned power on via UI/API.
 */
export function shouldHoldPowerOffAfterGap(input: {
  offlineGapMs: number;
  reportedPower: string;
  pendingExplicitPowerOn: boolean;
}): boolean {
  if (input.pendingExplicitPowerOn) return false;
  return input.offlineGapMs >= SILENCE_THRESHOLD_MS && isOfflinePower(input.reportedPower);
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

/**
 * Grill POSTs do not include the local panel setpoint. On offline → online
 * (including the first poll after bridge boot), adopt clampSetpoint(pit Temp)
 * so a stale web command buffer cannot overwrite a panel change.
 *
 * Skip when:
 * - the grill was already inside the online window (pit wobble must not rewrite SP)
 * - recipe automation is driving setpoint
 * - a UI/API setpoint is still pending (set after the last online delivery)
 * - pit Temp is missing/unparseable
 */
export function shouldAdoptPitSetpoint(input: {
  wasOnline: boolean;
  automationActive: boolean;
  pendingExplicitSetpoint: boolean;
  pitTemp: number | null;
}): boolean {
  return (
    !input.wasOnline &&
    !input.automationActive &&
    !input.pendingExplicitSetpoint &&
    input.pitTemp !== null
  );
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
