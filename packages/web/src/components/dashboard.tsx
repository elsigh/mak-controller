"use client";

import type { HistoryResponse, StatusResponse } from "@makgrill/shared";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStatus } from "@/hooks/use-status";
import { PageHeader } from "./page-header";
import { PitHero } from "./pit-hero";
import { ProbeCards } from "./probe-cards";
import { RecipeRunner } from "./recipe-runner";
import { SessionCard } from "./session-card";
import { SetpointControls } from "./setpoint-controls";
import { StatusPills } from "./status-pills";
import { TelemetryChart } from "./telemetry-chart";

export function Dashboard({
  initialStatus = null,
  initialHistory = null,
}: {
  initialStatus?: StatusResponse | null;
  initialHistory?: HistoryResponse | null;
}) {
  const { status, error, refresh } = useStatus(2500, initialStatus);

  return (
    <div className="space-y-4">
      <div className="flex min-h-16 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          title="Live pit"
          description={`Grill ${status?.state.grill_id ?? "—"} · last poll ${status?.state.last_seen ?? "waiting"}`}
          truncate
        />
        <StatusPills status={status} />
      </div>
      <div className="min-h-0 space-y-3">
        {error && (
          <Alert variant="destructive" className="rounded-2xl px-4 py-3">
            <AlertCircleIcon />
            <AlertTitle>Bridge error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {status && !status.is_online && (
          <Alert variant="destructive" className="rounded-2xl px-4 py-3">
            <AlertCircleIcon />
            <AlertTitle>Connection lost</AlertTitle>
            <AlertDescription>
              The grill must POST to <code>/GrillService/Service</code> at least every 15 seconds.
            </AlertDescription>
          </Alert>
        )}
        {status?.flameout_alert && (
          <Alert className="rounded-2xl border-transparent bg-orange-500 px-4 py-3 text-black">
            <AlertTitle className="text-black">Flameout detected</AlertTitle>
            <AlertDescription className="text-black/80">
              Pit dropped more than 35°F below setpoint for 8+ minutes.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <RecipeRunner status={status} onChange={refresh} />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <PitHero status={status} />
        <SetpointControls status={status} />
      </div>
      <ProbeCards status={status} />
      <TelemetryChart sessionId={status?.active_session?.id ?? null} initialHistory={initialHistory} />
      <SessionCard status={status} />
    </div>
  );
}
