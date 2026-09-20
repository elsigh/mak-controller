import {
  DEFAULT_COMMAND,
  DEFAULT_STATE,
  FLAMEOUT_DELTA_F,
  FLAMEOUT_DURATION_MS,
  analyzeBitmaskDiff,
  clampSetpoint,
  computeCooldown,
  computeOnline,
  encodeGrillResponse,
  parseNumber,
  shouldAdoptPitSetpoint,
  shouldResetCommandedPower,
} from "@makgrill/shared";
import type {
  AutomationStatus,
  GrillCommand,
  GrillState,
  ProbeKey,
  RecipeStage,
  StatusResponse,
} from "@makgrill/shared";
import { log } from "./config.ts";
import {
  getActiveSession,
  getHistory,
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

export class GrillRuntime {
  private command: GrillCommand = { ...DEFAULT_COMMAND };
  private state: GrillState = { ...DEFAULT_STATE };
  private lastSeenEpoch = 0;
  /** True after setSetpoint until the command is delivered on a grill poll. */
  private pendingExplicitSetpoint = false;
  private prevFlags: string | null = null;
  private flameoutStartEpoch: number | null = null;
  private flameoutTriggered = false;
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

  constructor(ntfyTopic = "") {
    this.ntfyTopic = ntfyTopic;
  }

  setNtfyTopic(topic: string) {
    this.ntfyTopic = topic;
  }

  getNtfyTopic() {
    return this.ntfyTopic;
  }

  private notify(title: string, message: string, priority = "default") {
    void sendNtfy(this.ntfyTopic, title, message, priority);
  }

  private nowStamp(now = new Date()) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  handleGrillPost(form: Record<string, string>, now = Date.now()): string {
    const clock = new Date(now);
    const wasOnline = computeOnline(this.lastSeenEpoch, now);

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
    this.evaluateFlameout(now, pitTemp, setpoint);

    if (shouldResetCommandedPower(this.command.power, this.state.power)) {
      log("INFO", `Cooldown acknowledged by grill (${this.state.power}). Resetting power command to 1.`);
      this.command.power = 1;
    }

    return encodeGrillResponse(this.command);
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
          log("WARN", `[ALARM] Flameout detected! Pit temp dropped to ${pitTemp}°F (Setpoint: ${setpoint}°F)`);
          this.notify(
            "MakGrill Flameout Warning!",
            `Pit temp dropped to ${pitTemp}°F (Setpoint: ${setpoint}°F)`,
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

  setSetpoint(temp: number): GrillCommand {
    this.command.setPoint = clampSetpoint(temp);
    this.pendingExplicitSetpoint = true;
    return this.command;
  }

  setPower(state: 0 | 1): { ok: boolean; error?: string; power: number } {
    const status = this.getStatus();
    if (status.is_cooldown && state === 1) {
      return { ok: false, error: "Grill is cooling down", power: this.command.power };
    }
    this.command.power = state;
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

  history(sessionId?: number | null) {
    return getHistory(sessionId ?? getActiveSession()?.id ?? null);
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
      at_set: this.state.flags.toUpperCase().includes("ATSET"),
      automation,
    };
  }
}
