"use client";

import { useEffect, useRef } from "react";
import type { ProbeKey, StatusResponse } from "@makgrill/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const PROBES: Array<{ key: ProbeKey; label: string; color: string }> = [
  { key: "probe1", label: "Probe 1", color: "var(--probe-1)" },
  { key: "probe2", label: "Probe 2", color: "var(--probe-2)" },
  { key: "probe3", label: "Probe 3", color: "var(--probe-3)" },
];

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    /* autoplay may be blocked */
  }
}

export function ProbeCards({ status }: { status: StatusResponse | null }) {
  const seen = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!status) return;
    for (const probe of PROBES) {
      const alerting = status.probe_alerts[probe.key];
      if (alerting && !seen.current[probe.key]) playChime();
      seen.current[probe.key] = alerting;
    }
  }, [status]);

  return (
    <section className="grid gap-3 md:grid-cols-3">
      {PROBES.map((probe) => {
        const raw = status?.is_online ? status.state[probe.key] : "";
        const value = raw ? `${raw}°F` : "Unplugged";
        const target = status?.probe_targets[probe.key];
        const alerting = Boolean(status?.probe_alerts[probe.key]);
        return (
          <div key={probe.key} className={cn("panel rounded-3xl p-5", alerting && "probe-alert")}>
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: probe.color }}>
              {probe.label}
            </p>
            <p className="mt-2 font-mono text-3xl">{value}</p>
            <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Target °F
              <input
                type="number"
                min={100}
                max={220}
                defaultValue={target ?? ""}
                key={`${probe.key}-${target ?? "none"}`}
                onBlur={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  void api.setProbeTarget(probe.key, next);
                }}
                className="mt-2 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 font-mono outline-none focus:border-amber-400"
              />
            </label>
          </div>
        );
      })}
    </section>
  );
}
