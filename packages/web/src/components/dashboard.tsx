"use client";

import type { HistoryResponse, StatusResponse } from "@makgrill/shared";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStatus } from "@/hooks/use-status";
import { CooldownControls } from "./cooldown-controls";
import { PitHero } from "./pit-hero";
import { ProbeCards } from "./probe-cards";
import { RecipeRunner } from "./recipe-runner";
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
      <div className="min-h-16">
        <h1 className="text-3xl font-semibold tracking-tight">Live pit</h1>
        <div className="mt-1 flex h-8 min-h-8 flex-nowrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            Last poll {status?.state.last_seen ?? "waiting"}
          </p>
          <StatusPills status={status} />
        </div>
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
      <PitHero status={status} />
      <ProbeCards status={status} />
      <TelemetryChart sessionId={status?.active_session?.id ?? null} initialHistory={initialHistory} />
      <CooldownControls status={status} />
    </div>
  );
}
