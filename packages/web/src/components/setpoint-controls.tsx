"use client";

import { SETPOINT_MAX, SETPOINT_MIN, SETPOINT_STEP, type StatusResponse } from "@makgrill/shared";
import { setPowerAction, setSetpointAction } from "@/app/actions";

const PRESETS = [200, 225, 250, 275, 300, 350];

export function SetpointControls({ status }: { status: StatusResponse | null }) {
  const locked = !status?.is_online || status.is_cooldown || status.state.power.toUpperCase() !== "ON";
  const current = status?.command.setPoint ?? 175;
  const chip =
    "rounded-full border border-[var(--line)] bg-black/25 py-2 text-sm disabled:opacity-40 hover:enabled:border-amber-400/60 hover:enabled:text-amber-300";

  return (
    <section className="panel rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Setpoint</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {SETPOINT_MIN}–{SETPOINT_MAX}°F, {SETPOINT_STEP}° steps
          </p>
        </div>
        <form action={setPowerAction}>
          <input type="hidden" name="state" value={status?.state.power.toUpperCase() === "ON" ? 0 : 1} />
          <button
            type="submit"
            disabled={!status?.is_online || status.is_cooldown}
            className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
              status?.is_cooldown
                ? "bg-orange-600"
                : status?.state.power.toUpperCase() === "ON"
                  ? "bg-red-600"
                  : "bg-emerald-600"
            }`}
          >
            {status?.is_cooldown
              ? "Cooldown locked"
              : status?.state.power.toUpperCase() === "ON"
                ? "Start cooldown"
                : "Turn on"}
          </button>
        </form>
      </div>
      <form action={setSetpointAction} className="flex gap-2">
        <input
          type="number"
          name="temp"
          min={SETPOINT_MIN}
          max={SETPOINT_MAX}
          step={SETPOINT_STEP}
          disabled={locked}
          defaultValue={current}
          key={current}
          className="w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3 font-mono text-lg outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={locked}
          className="rounded-2xl bg-amber-400 px-5 font-semibold text-black disabled:opacity-40"
        >
          Set
        </button>
      </form>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <form action={setSetpointAction}>
          <input type="hidden" name="temp" value={current - 5} />
          <button type="submit" disabled={locked} className={`w-full ${chip}`}>
            −5°
          </button>
        </form>
        <form action={setSetpointAction}>
          <input type="hidden" name="temp" value={current + 5} />
          <button type="submit" disabled={locked} className={`w-full ${chip}`}>
            +5°
          </button>
        </form>
        {PRESETS.map((temp) => (
          <form action={setSetpointAction} key={temp}>
            <input type="hidden" name="temp" value={temp} />
            <button type="submit" disabled={locked} className={`w-full ${chip}`}>
              {temp}°
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
