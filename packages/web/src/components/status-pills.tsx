"use client";

import type { StatusResponse } from "@makgrill/shared";
import { cn } from "@/lib/cn";

export function StatusPills({ status }: { status: StatusResponse | null }) {
  const online = status?.is_online ?? false;
  const cooldown = status?.is_cooldown ?? false;
  const power = status?.state.power ?? "--";
  const flameout = status?.flameout_alert ?? false;
  const atSet = status?.at_set ?? false;

  const label = !status
    ? "Connecting"
    : !online
      ? "Offline"
      : cooldown
        ? "Cooldown"
        : power.toUpperCase() === "ON"
          ? "Running"
          : power;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
          !online && "border-red-500/40 bg-red-500/10 text-red-200",
          online && cooldown && "border-orange-400/40 bg-orange-500/10 text-orange-200",
          online && !cooldown && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
        )}
      >
        <span
          className={cn(
            "live-dot h-2 w-2 rounded-full",
            !online ? "bg-red-400" : cooldown ? "bg-orange-400" : "bg-emerald-400",
          )}
        />
        {label}
      </span>
      {atSet && (
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-amber-200">
          At setpoint
        </span>
      )}
      {flameout && (
        <span className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-xs uppercase tracking-[0.16em] text-red-100">
          Flameout
        </span>
      )}
    </div>
  );
}
