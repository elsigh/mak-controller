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

export interface StatusResponse {
  state: GrillState;
  command: GrillCommand;
  is_online: boolean;
  is_cooldown: boolean;
  active_session: CookSession | null;
  probe_targets: Record<ProbeKey, number | null>;
  probe_alerts: Record<ProbeKey, boolean>;
  flameout_alert: boolean;
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
export const FLAMEOUT_DELTA_F = 35;
export const FLAMEOUT_DURATION_MS = 8 * 60 * 1000;

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

export function shouldResetCommandedPower(commandedPower: number, reported: string): boolean {
  return commandedPower === 0 && (isCooldownPower(reported) || isOfflinePower(reported));
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
