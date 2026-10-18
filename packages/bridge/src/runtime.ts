import {
  DEFAULT_COMMAND,
  DEFAULT_STATE,
  SILENCE_WATCHDOG_INTERVAL_MS,
  analyzeBitmaskDiff,
  clampSetpoint,
  computeCooldown,
  computeOnline,
  containsDangerToken,
  detectNewCook,
  encodeGrillResponse,
  encodeGrillResponseWithoutSetpoint,
  formatLocalStamp,
  HISTORY_CHART_DOWNSAMPLE_SECONDS,
  isSustainedSilence,
  parseNumber,
  shouldResetCommandedPower,
  shouldWatchSilence,
  unknownGrillPostKeys,
} from "@makgrill/shared";
import type {
  AutomationStatus,
  GrillCommand,
  GrillState,
  ProbeKey,
  RecipeStage,
  StatusResponse,
  UncommandedReplyMode,
} from "@makgrill/shared";
import { log } from "./config.ts";
import {
  bindProvisionalGrillName,
  getActiveSession,
  getHistory,
  getHistoryByDay,
  insertFlagEvent,
  insertTelemetry,
  resolveStoredGrillDisplayName,
  startSession,
  stopActiveSession,
} from "./db.ts";
import { getLastNtfyAlert, sendNtfy } from "./ntfy.ts";

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
  /** Reply while no setpoint is commanded. Default `hold` (HTTP 503, no command). */
  uncommandedReply?: UncommandedReplyMode;
}

export class GrillRuntime {
  private command: GrillCommand = { ...DEFAULT_COMMAND };
  private state: GrillState = { ...DEFAULT_STATE };
  private lastSeenEpoch = 0;
  /** True after an explicit UI/API power-on until the next grill poll delivers it. */
  private pendingExplicitPowerOn = false;
  private prevFlags: string | null = null;
  private loggedOnline = false;
  /** Set once per silence episode after the urgent ntfy; cleared on the next POST. */
  private silenceAlertedAt = 0;
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
  private readonly uncommandedReply: UncommandedReplyMode;
  /** When the commanded setpoint was last set by the user/API or a recipe stage. */
  private setpointSetAt = 0;
  /** When the current recipe was started. */
  private automationStartedAt = 0;
  /** Logged once per grill session while answering without a setpoint. */
  private loggedUncommanded = false;

  constructor(ntfyTopic = "", options: GrillRuntimeOptions = {}) {
    this.ntfyTopic = ntfyTopic;
    this.notifyOverride = options.notify;
    this.uncommandedReply = options.uncommandedReply ?? "hold";
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
   *
   * Silence is ALERT-ONLY: one urgent ntfy per silence episode while the last
   * POST reported Power ON. It never changes commanded power — grill Wi-Fi
   * drops are normal (2026-10-10: a routine 31s gap
   * used to force power=0 and put a live cook into COOLDOWN).
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

    if (
      !shouldWatchSilence({
        lastSeenEpoch: this.lastSeenEpoch,
        lastReportedPower: this.state.power,
      })
    ) {
      return;
    }

    // One alert per silence episode.
    if (this.silenceAlertedAt > 0) return;
    // A user-initiated shutdown is already in progress; silence adds nothing.
    if (this.command.power === 0) return;

    const silentFor = now - this.lastSeenEpoch;
    this.silenceAlertedAt = now;
    log(
      "WARN",
      `Silence alert: no grill POST for ${silentFor}ms while last Power=${this.state.power}. Sending urgent ntfy; commanded power left at ${this.command.power}.`,
    );
    this.notify(
      "MakGrill: grill not reporting",
      `No update from the grill for ${Math.round(silentFor / 1000)}s (last Power=${this.state.power}, pit ${this.state.temp}°F, setpoint ${this.command.setPoint === null ? "set on grill" : `${this.command.setPoint}°F`}). MakGrill did NOT change power — the grill keeps cooking on its own. Check grill Wi-Fi / Web Ctrl.`,
      "urgent",
    );
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

  /**
   * Handle one grill POST. Returns the quoted reply body, or `null` when the
   * bridge has no command for the grill (no app setpoint for this cook and
   * UNCOMMANDED_REPLY=hold); the route then answers HTTP 503 with no body so
   * the grill keeps the setpoint from its own panel.
   */
  handleGrillPost(form: Record<string, string>, now = Date.now()): string | null {
    this.logUnknownFormKeys(form);
    const clock = new Date(now);
    const previousSeen = this.lastSeenEpoch;
    const previousPower = previousSeen > 0 ? this.state.power : null;
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
    bindProvisionalGrillName(this.state.grill_id);

    const newCook = detectNewCook({
      previousPower,
      previousSeenEpoch: previousSeen,
      power: this.state.power,
      now,
    });
    if (newCook) this.beginGrillCook(newCook, previousSeen);

    const pitTemp = parseNumber(this.state.temp);
    // The commanded setpoint is NEVER derived from grill reports (no pit-temp
    // adoption on reconnect). Only setSetpoint and recipe automation set it;
    // a new cook (beginGrillCook) only ever clears it to "not commanding".
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
    this.applyCooldownAcknowledgement();

    return this.encodeReply();
  }

  /**
   * A new cook started (first poll since bridge start, fresh START, back from
   * OFF/cooldown, or a NEW_COOK_GAP_MS silence). An app setpoint or recipe from
   * the previous cook is dropped so it is never pushed onto this one; the
   * bridge then stops commanding a setpoint and the grill keeps its panel
   * value. A setpoint/recipe chosen after the last poll (while the grill was
   * away) is the user's intent for this cook and is kept. Power is untouched.
   */
  private beginGrillCook(reason: string, previousSeen: number) {
    this.loggedUncommanded = false;
    if (this.automation.active && this.automationStartedAt <= previousSeen) {
      log("INFO", `New grill cook (${reason}): stopping recipe '${this.automation.name}' from the previous cook.`);
      this.stopAutomation();
    }
    if (this.command.setPoint !== null && this.setpointSetAt <= previousSeen) {
      log(
        "INFO",
        `New grill cook (${reason}): dropping previous cook's setpoint ${this.command.setPoint}°F; not commanding a setpoint until one is set in the app.`,
      );
      this.command.setPoint = null;
    } else if (this.command.setPoint === null) {
      log("INFO", `New grill cook (${reason}): no app setpoint yet; the grill keeps its panel setpoint.`);
    }
  }

  /**
   * With an app setpoint, the full quoted command. Without one, never a made-up
   * temperature: by default no command at all (null → HTTP 503). An explicit
   * user power-off is always delivered as a full reply (FALLBACK_SETPOINT is
   * only the wire placeholder; the grill is shutting down).
   */
  private encodeReply(): string | null {
    if (this.command.setPoint !== null || this.command.power === 0) {
      return encodeGrillResponse(this.command);
    }
    if (!this.loggedUncommanded) {
      this.loggedUncommanded = true;
      log(
        "INFO",
        `No app setpoint for this cook (UNCOMMANDED_REPLY=${this.uncommandedReply}): ${
          this.uncommandedReply === "hold"
            ? "answering HTTP 503 with no command so the grill keeps its panel setpoint"
            : this.uncommandedReply === "omit"
              ? "answering without a setPoint key"
              : "answering the legacy setPoint=175 placeholder (overwrites the panel)"
        }.`,
      );
    }
    if (this.uncommandedReply === "legacy") return encodeGrillResponse(this.command);
    if (this.uncommandedReply === "omit") return encodeGrillResponseWithoutSetpoint(this.command);
    return null;
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
    if (this.silenceAlertedAt > 0) {
      const silentSec = Math.round((now - previousSeen) / 1000);
      log("INFO", `Silence episode over: grill back after ${silentSec}s (Power=${this.state.power}).`);
      this.notify(
        "MakGrill: grill back online",
        `Grill reporting again after ${silentSec}s. Power=${this.state.power}, pit ${this.state.temp}°F.`,
        "default",
      );
    }
    this.silenceAlertedAt = 0;
  }

  /**
   * MakGrill NEVER automatically answers power=0. The only path to commanded
   * power=0 is an explicit UI/API setPower(0) (cooldown / power off). Once the
   * grill acknowledges that with COOL/CD/OFF, reset the command to 1 (upstream
   * behavior). Long gaps, first polls after a restart and danger flags do not
   * touch power — the grill's own firmware decides what to do.
   */
  private applyCooldownAcknowledgement() {
    if (this.pendingExplicitPowerOn) {
      this.pendingExplicitPowerOn = false;
      return;
    }
    if (shouldResetCommandedPower(this.command.power, this.state.power)) {
      log("INFO", `Cooldown acknowledged by grill (${this.state.power}). Resetting power command to 1.`);
      this.command.power = 1;
    }
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
      this.setpointSetAt = now;
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
      this.setpointSetAt = now;
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
    const target = setpoint === null ? "the grill's own setpoint" : `setpoint of ${setpoint}°F`;
    if (setpoint !== this.lastAlertedSetpoint) {
      this.atSetAlerted = false;
    }
    const flags = this.state.flags.toUpperCase();
    if (flags.includes("ATSET")) {
      if (!this.atSetAlerted) {
        this.atSetAlerted = true;
        this.lastAlertedSetpoint = setpoint;
        log("INFO", `[NOTIFICATION] Pit reached ${target}`);
        this.notify("MakGrill: Target Temp Reached", `Pit reached ${target} (Current: ${pitTemp}°F).`);
      }
    } else if (pitTemp !== null && setpoint !== null && pitTemp < setpoint - 15) {
      this.atSetAlerted = false;
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
    // Alert-only: the Pellet Boss handles its own faults. MakGrill must never
    // answer power=0 on its own (2026-10-10 decision).
    log(
      "WARN",
      `[ALARM] Danger token in GrillFlags/Power ('${this.state.flags}' / '${this.state.power}'). Alerting only; commanded power left at ${this.command.power}.`,
    );
    this.notify(
      "MakGrill: danger flag",
      `GrillFlags='${this.state.flags}' Power='${this.state.power}', pit ${this.state.temp}°F. MakGrill did NOT change power — the grill's controller handles its own faults. Check the grill.`,
      "urgent",
    );
  }

  /** The user's app/API setpoint: from here on the bridge commands it every poll. */
  setSetpoint(temp: number, now = Date.now()): GrillCommand & { setPoint: number } {
    const setPoint = clampSetpoint(temp);
    this.command.setPoint = setPoint;
    this.setpointSetAt = now;
    return { ...this.command, setPoint };
  }

  setPower(state: 0 | 1): { ok: boolean; error?: string; power: number } {
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

  startAutomation(name: string, stages: RecipeStage[], now = Date.now()) {
    this.automationStartedAt = now;
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

  skipAutomationStage(now = Date.now()) {
    if (!this.automation.active) return;
    const nextIdx = this.automation.stageIdx + 1;
    if (nextIdx < this.automation.stages.length) {
      this.automation.stageIdx = nextIdx;
      this.automation.stageStartedEpoch = now;
      const next = this.automation.stages[nextIdx];
      this.command.setPoint = clampSetpoint(Number(next.setpoint));
      this.setpointSetAt = now;
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
      command: { ...this.command },
      is_online: isOnline,
      is_cooldown: computeCooldown(isOnline, this.state.power, this.command.power),
      active_session: getActiveSession(),
      probe_targets: { ...this.probeTargets },
      probe_alerts: { ...this.probeAlerted },
      silence_alerted: this.silenceAlertedAt > 0,
      ntfy_configured: this.ntfyTopic.trim() !== "",
      last_alert: getLastNtfyAlert(),
      at_set: this.state.flags.toUpperCase().includes("ATSET"),
      automation,
      grill_name: resolveStoredGrillDisplayName(this.state.grill_id),
      uncommanded_reply: this.uncommandedReply,
    };
  }
}
