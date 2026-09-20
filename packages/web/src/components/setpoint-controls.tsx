"use client";

import { useState } from "react";
import { SETPOINT_MAX, SETPOINT_MIN, SETPOINT_STEP, type StatusResponse } from "@makgrill/shared";
import { api } from "@/lib/api";

const PRESETS = [200, 225, 250, 275, 300, 350];

export function SetpointControls({
  status,
  onChange,
}: {
  status: StatusResponse | null;
  onChange: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const locked = !status?.is_online || status.is_cooldown || status.state.power.toUpperCase() !== "ON";
  const current = status?.command.setPoint ?? 175;
  const chip =
    "rounded-full border border-[var(--line)] bg-black/25 py-2 text-sm disabled:opacity-40 hover:enabled:border-amber-400/60 hover:enabled:text-amber-300";

  async function apply(temp: number) {
    if (locked) return;
    await api.setSetpoint(temp);
    await onChange();
  }

  async function togglePower() {
    if (!status?.is_online || status.is_cooldown) return;
    const next = status.command.power === 1 ? 0 : 1;
    await api.setPower(next);
    await onChange();
  }

  return (
    <section className="panel rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Setpoint</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {SETPOINT_MIN}–{SETPOINT_MAX}°F, {SETPOINT_STEP}° steps
          </p>
        </div>
        <button
          type="button"
          disabled={!status?.is_online || status.is_cooldown}
          onClick={() => void togglePower()}
          className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
            status?.is_cooldown
              ? "bg-orange-600"
              : status?.command.power === 1 && status.state.power.toUpperCase() === "ON"
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
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={SETPOINT_MIN}
          max={SETPOINT_MAX}
          step={SETPOINT_STEP}
          value={draft}
          disabled={locked}
          placeholder={`${current}`}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3 font-mono text-lg outline-none focus:border-amber-400"
        />
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            if (draft) void apply(Number(draft));
            setDraft("");
          }}
          className="rounded-2xl bg-amber-400 px-5 font-semibold text-black disabled:opacity-40"
        >
          Set
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <button type="button" disabled={locked} onClick={() => void apply(current - 5)} className={chip}>
          −5°
        </button>
        <button type="button" disabled={locked} onClick={() => void apply(current + 5)} className={chip}>
          +5°
        </button>
        {PRESETS.map((temp) => (
          <button key={temp} type="button" disabled={locked} onClick={() => void apply(temp)} className={chip}>
            {temp}°
          </button>
        ))}
      </div>
    </section>
  );
}
