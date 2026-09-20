"use client";

import type { StatusResponse } from "@makgrill/shared";
import { useStatus } from "@/hooks/use-status";
import { PitHero } from "./pit-hero";
import { ProbeCards } from "./probe-cards";
import { RecipeRunner } from "./recipe-runner";
import { SessionCard } from "./session-card";
import { SetpointControls } from "./setpoint-controls";
import { StatusPills } from "./status-pills";
import { TelemetryChart } from "./telemetry-chart";

export function Dashboard({ initialStatus = null }: { initialStatus?: StatusResponse | null }) {
  const { status, error, refresh } = useStatus(2500, initialStatus);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Live pit</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Grill {status?.state.grill_id ?? "—"} · last poll {status?.state.last_seen ?? "waiting"}
          </p>
        </div>
        <StatusPills status={status} />
      </div>
      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {status && !status.is_online && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm">
          Connection lost — the grill must POST to <code>/GrillService/Service</code> at least every 15 seconds.
        </div>
      )}
      {status?.flameout_alert && (
        <div className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-black">
          Flameout detected — pit dropped more than 35°F below setpoint for 8+ minutes.
        </div>
      )}
      <RecipeRunner status={status} onChange={refresh} />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <PitHero status={status} />
        <SetpointControls status={status} onChange={refresh} />
      </div>
      <ProbeCards status={status} />
      <TelemetryChart sessionId={status?.active_session?.id ?? null} />
      <SessionCard status={status} onChange={refresh} />
    </div>
  );
}
