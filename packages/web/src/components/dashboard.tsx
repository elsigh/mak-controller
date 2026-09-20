"use client";

import { describePowerFailSafe, localCalendarDay, type HistoryResponse, type StatusResponse } from "@makgrill/shared";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStatus } from "@/hooks/use-status";
import { CooldownControls } from "./cooldown-controls";
import { PitHero } from "./pit-hero";
import { ProbeCards } from "./probe-cards";
import { StatusPills } from "./status-pills";
import { TelemetryChart } from "./telemetry-chart";

export function Dashboard({
  initialStatus = null,
  initialHistory = null,
  today = localCalendarDay(),
}: {
  initialStatus?: StatusResponse | null;
  initialHistory?: HistoryResponse | null;
  today?: string;
}) {
  const { status, error } = useStatus(2500, initialStatus);

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
              {status.power_failsafe
                ? ` Commanded power was force-zeroed (${describePowerFailSafe(status.power_failsafe_reason)}). The next poll will request cooldown.`
                : " After 30 seconds of silence, commanded power is force-zeroed."}
            </AlertDescription>
          </Alert>
        )}
        {status?.power_failsafe && status.is_online && (
          <Alert variant="destructive" className="rounded-2xl px-4 py-3">
            <AlertCircleIcon />
            <AlertTitle>Heat command held at 0</AlertTitle>
            <AlertDescription>
              Commanded power was force-zeroed ({describePowerFailSafe(status.power_failsafe_reason)}
              ). Turn the grill on from the dashboard to resume heat.
            </AlertDescription>
          </Alert>
        )}
        {status?.flameout_alert && (
          <Alert className="rounded-2xl border-transparent bg-orange-500 px-4 py-3 text-black">
            <AlertTitle className="text-black">Flameout detected</AlertTitle>
            <AlertDescription className="text-black/80">
              Pit dropped more than 35°F below setpoint for 8+ minutes. Commanded power is 0.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <PitHero status={status} />
      <ProbeCards status={status} />
      <TelemetryChart day={today} initialHistory={initialHistory} />
      <CooldownControls status={status} />
    </div>
  );
}
