import {
  DEFAULT_COMMAND,
  DEFAULT_STATE,
  FLAMEOUT_DELTA_F,
  FLAMEOUT_DURATION_MS,
  SILENCE_RENOTIFY_MS,
  SILENCE_WATCHDOG_INTERVAL_MS,
  analyzeBitmaskDiff,
  clampSetpoint,
  computeCooldown,
  computeOnline,
  containsDangerToken,
  encodeGrillResponse,
  formatLocalStamp,
  HISTORY_CHART_DOWNSAMPLE_SECONDS,
  isSustainedSilence,
  parseNumber,
  shouldAdoptPitSetpoint,
  shouldHoldPowerOffAfterGap,
  shouldResetCommandedPower,
  shouldWatchSilence,
  unknownGrillPostKeys,
} from "@makgrill/shared";
import type {
  AutomationStatus,
  GrillCommand,
  GrillState,
  PowerFailSafeReason,
  ProbeKey,
  RecipeStage,
  StatusResponse,
} from "@makgrill/shared";
import { log } from "./config.ts";
import {
  getActiveSession,
  getHistory,
  getHistoryByDay,
  insertFlagEvent,
  insertTelemetry,
  startSession,
  stopActiveSession,
} from "./db.ts";
import { sendNtfy } from "./ntfy.ts";

const PROBES: ProbeKey[] = ["probe1", "probe2", "probe3"];

interface AutomationState {
  active: boolean;
  name: string;
  stageIdx: number;
  stageStartedEpoch: number | null;
  stages: RecipeStage[];
}

export interface GrillRuntimeOptions {
  notify?: (title: string, message: string, priority?: string) => void;
}

export class GrillRuntime {
  private command: GrillCommand = { ...DEFAULT_COMMAND };
  private state: GrillState = { ...DEFAULT_STATE };
  private lastSeenEpoch = 0;
  /** True after setSetpoint until the command is delivered on a grill poll. */
  private pendingExplicitSetpoint = false;
  /** True after an explicit UI/API power-on until the next grill poll delivers it. */
  private pendingExplicitPowerOn = false;
  private prevFlags: string | null = null;
  private flameoutStartEpoch: number | null = null;
  private flameoutTriggered = false;
  private loggedOnline = false;
  private silenceNotifiedAt = 0;
  private powerFailSafe: PowerFailSafeReason | null = null;
  private dangerAlerted = false;
  private seenUnknownKeys = new Set<string>();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private readonly notifyOverride?: GrillRuntimeOptions["notify"];
  private atSetAlerted = false;
  private lastAlertedSetpoint: number | null = null;
  private probeTargets: Record<ProbeKey, number | null> = {
    probe1: null,
    probe2: null,
    probe3: null,
  };
  private probeAlerted: Record<ProbeKey, boolean> = {
    probe1: false,
    probe2: false,
    probe3: false,
  };
  private automation: AutomationState = {
    active: false,
    name: "",
    stageIdx: 0,
    stageStartedEpoch: null,
    stages: [],
  };
  private ntfyTopic = "";

  constructor(ntfyTopic = "", options: GrillRuntimeOptions = {}) {
    this.ntfyTopic = ntfyTopic;
    this.notifyOverride = options.notify;
  }

  setNtfyTopic(topic: string) {
    this.ntfyTopic = topic;
  }

  getNtfyTopic() {
    return this.ntfyTopic;
  }

  private notify(title: string, message: string, priority = "default") {
    if (this.notifyOverride) {
      this.notifyOverride(title, message, priority);
      return;
    }
    void sendNtfy(this.ntfyTopic, title, message, priority);
  }

  startWatchdog(intervalMs = SILENCE_WATCHDOG_INTERVAL_MS) {
    this.stopWatchdog();
    const timer = setInterval(() => this.tickWatchdog(), intervalMs);
    timer.unref?.();
    this.watchdogTimer = timer;
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Independent of handleGrillPost. Silence is invisible if we only look
   * inside the POST handler — this is what the 2026-09-20 blackout needed.
   */
  tickWatchdog(now = Date.now()) {
    const online = computeOnline(this.lastSeenEpoch, now);
    if (this.loggedOnline && !online && this.lastSeenEpoch > 0) {
      const silentFor = now - this.lastSeenEpoch;
      log(
        "WARN",
        `Grill went offline at ${this.nowStamp(new Date(now))} (last POST ${silentFor}ms ago, last Power=${this.state.power}).`,
      );
      this.loggedOnline = false;
    }

    if (!isSustainedSilence(this.lastSeenEpoch, now)) return;

    let sessionActive = false;
    try {
      sessionActive = Boolean(getActiveSession());
    } catch {
      sessionActive = false;
    }

    if (
      !shouldWatchSilence({
        lastSeenEpoch: this.lastSeenEpoch,
        lastReportedPower: this.state.power,
        sessionActive,
      })
    ) {
      return;
    }

    const silentFor = now - this.lastSeenEpoch;
    this.forcePowerOff(
      "silence",
      `Silence fail-safe: no grill POST for ${silentFor}ms while last Power=${this.state.power}; commanding power=0 so the next poll requests cooldown.`,
    );

    if (this.silenceNotifiedAt === 0 || now - this.silenceNotifiedAt >= SILENCE_RENOTIFY_MS) {
      this.silenceNotifiedAt = now;
      this.notify(
        "MakGrill: grill silent / Web Ctrl lost",
        `No POST for ${Math.round(silentFor / 1000)}s. Last Power=${this.state.power}. Commanded power set to 0.`,
        "urgent",
      );
    }
  }

  private forcePowerOff(reason: PowerFailSafeReason, message: string) {
    const alreadyHeld = this.command.power === 0 && this.powerFailSafe === reason;
    this.command.power = 0;
    this.powerFailSafe = reason;
    if (!alreadyHeld) {
      log("WARN", message);
    }
  }

  private logUnknownFormKeys(form: Record<string, string>) {
    for (const key of unknownGrillPostKeys(form, this.seenUnknownKeys)) {
      this.seenUnknownKeys.add(key);
      log("INFO", `Unknown grill POST key '${key}' (logged once): ${form[key]}`);
    }
  }

  private nowStamp(now = new Date()) {
    return formatLocalStamp(now);
  }

  handleGrillPost(form: Record<string, string>, now = Date.now()): string {
    this.logUnknownFormKeys(form);
    const clock = new Date(now);
    const previousSeen = this.lastSeenEpoch;
    const wasOnline = computeOnline(previousSeen, now);

    this.state = {
      grill_id: form.GrillId || "Unknown",
      temp: form.Temp ?? "--",
      power: form.Power || "OFF",
      probe1: form.Probe1 ?? "",
      probe2: form.Probe2 ?? "",
      probe3: form.Probe3 ?? "",
      flags: form.GrillFlags ?? "",
      last_seen: clock.toTimeString().slice(0, 8),
    };

    const pitTemp = parseNumber(this.state.temp);
    this.maybeAdoptSetpointOnReconnect(wasOnline, pitTemp);
    this.lastSeenEpoch = now;
    this.notePollResumed(wasOnline, previousSeen, now);

    const timestamp = this.nowStamp(clock);
    const session = getActiveSession();
    const setpoint = parseNumber(this.command.setPoint);

    insertTelemetry({
      sessionId: session?.id ?? null,
      timestamp,
      grillTemp: pitTemp,
      setpoint,
      probe1: parseNumber(this.state.probe1),
      probe2: parseNumber(this.state.probe2),
      probe3: parseNumber(this.state.probe3),
      power: this.state.power,
      flags: this.state.flags,
    });

    if (this.prevFlags !== null && this.state.flags !== this.prevFlags) {
      const analysis = analyzeBitmaskDiff(this.prevFlags, this.state.flags);
      log("DEBUG", `GrillFlags changed: '${this.prevFlags}' -> '${this.state.flags}' | ${analysis}`);
      insertFlagEvent({
        timestamp,
        fieldName: "GrillFlags",
        oldVal: String(this.prevFlags),
        newVal: String(this.state.flags),
        bitDiff: analysis,
        context: `Temp: ${this.state.temp} | Power: ${this.state.power}`,
      });
    }
    this.prevFlags = this.state.flags;

    this.evaluateAutomation(now);
    this.evaluateProbeAlarms();
    this.evaluateAtSet(pitTemp, setpoint);
    this.evaluateDangerFlags();
    this.evaluateFlameout(now, pitTemp, setpoint);
    this.applyPowerReconnectPolicy(previousSeen, now);

    return encodeGrillResponse(this.command);
  }

  private notePollResumed(wasOnline: boolean, previousSeen: number, now: number) {
    if (!wasOnline) {
      const origin =
        previousSeen === 0 ? "first poll" : `offline for ${now - previousSeen}ms`;
      log(
        "INFO",
        `Grill back online at ${this.nowStamp(new Date(now))} (${origin}; Power=${this.state.power}).`,
      );
    }
    this.loggedOnline = true;
    this.silenceNotifiedAt = 0;
  }

  private applyPowerReconnectPolicy(previousSeen: number, now: number) {
    const offlineGapMs = previousSeen === 0 ? Number.POSITIVE_INFINITY : now - previousSeen;
    const holdAfterGap = shouldHoldPowerOffAfterGap({
      offlineGapMs,
      reportedPower: this.state.power,
      pendingExplicitPowerOn: this.pendingExplicitPowerOn,
    });

    if (this.pendingExplicitPowerOn) {
      this.pendingExplicitPowerOn = false;
      return;
    }

    if (holdAfterGap) {
      this.forcePowerOff(
        "offline-off",
        `Long offline gap (${offlineGapMs === Number.POSITIVE_INFINITY ? "never seen" : `${offlineGapMs}ms`}) and grill reports OFF; holding commanded power at 0 until explicit UI/API power-on.`,
      );
      return;
    }

    if (shouldResetCommandedPower(this.command.power, this.state.power, this.powerFailSafe !== null)) {
      log("INFO", `Cooldown acknowledged by grill (${this.state.power}). Resetting power command to 1.`);
      this.command.power = 1;
    }
  }

  private maybeAdoptSetpointOnReconnect(wasOnline: boolean, pitTemp: number | null) {
    if (wasOnline) {
      this.pendingExplicitSetpoint = false;
      return;
    }

    if (
      pitTemp !== null &&
      shouldAdoptPitSetpoint({
        wasOnline,
        automationActive: this.automation.active,
        pendingExplicitSetpoint: this.pendingExplicitSetpoint,
        pitTemp,
      })
    ) {
      const previous = this.command.setPoint;
      const adopted = clampSetpoint(pitTemp);
      this.command.setPoint = adopted;
      const origin = this.lastSeenEpoch === 0 ? "never seen" : "offline";
      log(
        "INFO",
        `Adopting pit-based setpoint on reconnect: ${previous}°F → ${adopted}°F (pit ${pitTemp}°F; grill was ${origin}).`,
      );
      return;
    }

    if (this.automation.active) {
      log(
        "INFO",
        `Reconnect: keeping command setpoint ${this.command.setPoint}°F because recipe automation is active.`,
      );
    } else if (this.pendingExplicitSetpoint) {
      log(
        "INFO",
        `Reconnect: keeping pending UI/API setpoint ${this.command.setPoint}°F (set while grill was offline).`,
      );
    } else if (pitTemp === null) {
      log(
        "INFO",
        `Reconnect: no valid pit temp; keeping command setpoint ${this.command.setPoint}°F.`,
      );
    }

    this.pendingExplicitSetpoint = false;
  }

  private evaluateAutomation(now: number) {
    if (!this.automation.active || this.automation.stages.length === 0) return;

    const { stages, stageIdx } = this.automation;
    if (stageIdx >= stages.length) {
      this.automation.active = false;
      return;
    }

    const current = stages[stageIdx];
    if (this.automation.stageStartedEpoch === null) {
      this.automation.stageStartedEpoch = now;
      this.command.setPoint = clampSetpoint(Number(current.setpoint));
      const msg = `Started ${current.name || `Stage ${stageIdx + 1}`}: SetPoint set to ${this.command.setPoint}°F`;
      log("INFO", `[AUTOMATION] ${msg}`);
      this.notify(`Automation: ${current.name || `Stage ${stageIdx + 1}`}`, msg);
      return;
    }

    let triggered = false;
    const trigVal = Number(current.trigger_val) || 0;

    if (current.trigger_type === "time") {
      const elapsedMin = (now - this.automation.stageStartedEpoch) / 60_000;
      triggered = elapsedMin >= trigVal;
    } else if (PROBES.includes(current.trigger_type as ProbeKey)) {
      const probeTemp = parseNumber(this.state[current.trigger_type as ProbeKey]);
      if (probeTemp !== null) {
        if (current.trigger_cond === "lte") triggered = probeTemp <= trigVal;
        else triggered = probeTemp >= trigVal;
      }
    }

    if (!triggered) return;

    const nextIdx = stageIdx + 1;
    if (nextIdx < stages.length) {
      this.automation.stageIdx = nextIdx;
      this.automation.stageStartedEpoch = now;
      const next = stages[nextIdx];
      this.command.setPoint = clampSetpoint(Number(next.setpoint));
      const msg = `Stage ${stageIdx + 1} complete. Advancing to '${next.name || `Stage ${nextIdx + 1}`}' @ ${this.command.setPoint}°F`;
      log("INFO", `[AUTOMATION] ${msg}`);
      this.notify("Automation: Stage Advance", msg, "high");
    } else {
      this.automation.active = false;
      const msg = `Recipe '${this.automation.name}' completed all stages!`;
      log("INFO", `[AUTOMATION] ${msg}`);
      this.notify("Automation Complete", msg, "high");
    }
  }

  private evaluateProbeAlarms() {
    for (const key of PROBES) {
      const target = this.probeTargets[key];
      const current = parseNumber(this.state[key]);
      if (target !== null && current !== null && current >= target) {
        if (!this.probeAlerted[key]) {
          this.probeAlerted[key] = true;
          log("INFO", `[ALARM] ${key.toUpperCase()} reached target ${target}°F (Current: ${current}°F)`);
          this.notify(
            `MakGrill Alert: ${key.toUpperCase()} Done!`,
            `Temperature is ${current}°F (Target: ${target}°F)`,
            "high",
          );
        }
      } else if (current !== null && target !== null && current < target - 3) {
        this.probeAlerted[key] = false;
      }
    }
  }

  private evaluateAtSet(pitTemp: number | null, setpoint: number | null) {
    if (setpoint !== this.lastAlertedSetpoint) {
      this.atSetAlerted = false;
    }
    const flags = this.state.flags.toUpperCase();
    if (flags.includes("ATSET")) {
      if (!this.atSetAlerted) {
        this.atSetAlerted = true;
        this.lastAlertedSetpoint = setpoint;
        log("INFO", `[NOTIFICATION] Pit reached setpoint (${setpoint}°F)`);
        this.notify(
          "MakGrill: Target Temp Reached",
          `Pit reached setpoint of ${setpoint}°F (Current: ${pitTemp}°F).`,
        );
      }
    } else if (pitTemp !== null && setpoint !== null && pitTemp < setpoint - 15) {
      this.atSetAlerted = false;
    }
  }

  private evaluateFlameout(now: number, pitTemp: number | null, setpoint: number | null) {
    const reported = this.state.power.toUpperCase();
    if (reported === "ON" && pitTemp !== null && setpoint !== null) {
      if (pitTemp < setpoint - FLAMEOUT_DELTA_F) {
        if (this.flameoutStartEpoch === null) {
          this.flameoutStartEpoch = now;
        } else if (now - this.flameoutStartEpoch >= FLAMEOUT_DURATION_MS && !this.flameoutTriggered) {
          this.flameoutTriggered = true;
          log(
            "WARN",
            `[ALARM] Flameout detected! Pit temp dropped to ${pitTemp}°F (Setpoint: ${setpoint}°F). Alert only; not commanding power=0.`,
          );
          this.notify(
            "MakGrill Flameout Warning!",
            `Pit temp dropped to ${pitTemp}°F (Setpoint: ${setpoint}°F). Heat is still commanded on — check the lid / fire. This watchdog does not shut the grill down.`,
            "urgent",
          );
        }
      } else {
        this.flameoutStartEpoch = null;
        this.flameoutTriggered = false;
      }
    } else {
      this.flameoutStartEpoch = null;
      this.flameoutTriggered = false;
    }
  }

  private evaluateDangerFlags() {
    const haystack = `${this.state.flags} ${this.state.power}`;
    if (!containsDangerToken(haystack)) {
      this.dangerAlerted = false;
      return;
    }
    if (this.dangerAlerted) return;
    this.dangerAlerted = true;
    this.forcePowerOff(
      "danger",
      `[ALARM] Danger token in GrillFlags/Power ('${this.state.flags}' / '${this.state.power}'). Commanding power=0.`,
    );
    this.notify(
      "MakGrill: danger flag",
      `GrillFlags='${this.state.flags}' Power='${this.state.power}'. Commanded power set to 0.`,
      "urgent",
    );
  }

  setSetpoint(temp: number): GrillCommand {
    this.command.setPoint = clampSetpoint(temp);
    this.pendingExplicitSetpoint = true;
    return this.command;
  }

  setPower(state: 0 | 1): { ok: boolean; error?: string; power: number } {
    if (state === 1 && this.powerFailSafe) {
      log("INFO", `Clearing power fail-safe (${this.powerFailSafe}) after explicit UI/API power-on.`);
      this.powerFailSafe = null;
      this.pendingExplicitPowerOn = true;
      this.command.power = 1;
      return { ok: true, power: 1 };
    }
    const status = this.getStatus();
    if (status.is_cooldown && state === 1) {
      return { ok: false, error: "Grill is cooling down", power: this.command.power };
    }
    this.command.power = state;
    this.pendingExplicitPowerOn = state === 1;
    return { ok: true, power: state };
  }

  setProbeTarget(probe: ProbeKey, target: number | null) {
    this.probeTargets[probe] = target;
    this.probeAlerted[probe] = false;
    return { probe, target };
  }

  startAutomation(name: string, stages: RecipeStage[]) {
    this.automation = {
      active: true,
      name,
      stageIdx: 0,
      stageStartedEpoch: null,
      stages,
    };
  }

  stopAutomation() {
    this.automation.active = false;
    this.automation.stages = [];
    this.automation.stageStartedEpoch = null;
  }

  skipAutomationStage() {
    if (!this.automation.active) return;
    const nextIdx = this.automation.stageIdx + 1;
    if (nextIdx < this.automation.stages.length) {
      this.automation.stageIdx = nextIdx;
      this.automation.stageStartedEpoch = Date.now();
      const next = this.automation.stages[nextIdx];
      this.command.setPoint = clampSetpoint(Number(next.setpoint));
    } else {
      this.automation.active = false;
    }
  }

  beginSession(name: string) {
    return startSession(name, this.nowStamp());
  }

  endSession() {
    stopActiveSession(this.nowStamp());
  }

  history(query?: number | null | { sessionId?: number | null; day?: string; dense?: boolean }) {
    if (query && typeof query === "object") {
      if (query.day) {
        return getHistoryByDay(query.day, query.dense ? 0 : HISTORY_CHART_DOWNSAMPLE_SECONDS);
      }
      return getHistory(query.sessionId ?? getActiveSession()?.id ?? null);
    }
    return getHistory(query ?? getActiveSession()?.id ?? null);
  }

  getStatus(now = Date.now()): StatusResponse {
    const isOnline = computeOnline(this.lastSeenEpoch, now);
    const automation: AutomationStatus = {
      active: this.automation.active,
      name: this.automation.name,
      stage_idx: this.automation.stageIdx,
      total_stages: this.automation.stages.length,
      stage_elapsed_sec: this.automation.stageStartedEpoch
        ? (now - this.automation.stageStartedEpoch) / 1000
        : 0,
      current_stage:
        this.automation.active && this.automation.stageIdx < this.automation.stages.length
          ? this.automation.stages[this.automation.stageIdx]
          : null,
    };

    return {
      state: this.state,
      command: this.command,
      is_online: isOnline,
      is_cooldown: computeCooldown(isOnline, this.state.power, this.command.power),
      active_session: getActiveSession(),
      probe_targets: { ...this.probeTargets },
      probe_alerts: { ...this.probeAlerted },
      flameout_alert: this.flameoutTriggered,
      power_failsafe: this.powerFailSafe !== null,
      power_failsafe_reason: this.powerFailSafe,
      at_set: this.state.flags.toUpperCase().includes("ATSET"),
      automation,
    };
  }
}
