"use client";

import type { StatusResponse } from "@makgrill/shared";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatusPills({ status }: { status: StatusResponse | null }) {
  const online = status?.is_online ?? false;
  const cooldown = status?.is_cooldown ?? false;
  const power = status?.state.power ?? "--";
  const held = status?.power_failsafe ?? false;
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
    <div className="flex h-8 shrink-0 items-center justify-end gap-2">
      {!status ? (
        <Skeleton className="h-8 w-28 rounded-full" />
      ) : (
        <Badge
          variant="outline"
          className={cn(
            "h-8 min-w-28 justify-center gap-2 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.16em]",
            !online && "border-red-500/40 bg-red-500/10 text-red-200",
            online && cooldown && "border-orange-400/40 bg-orange-500/10 text-orange-200",
            online && !cooldown && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
          )}
        >
          <span
            className={cn(
              "live-dot size-2 rounded-full",
              !online ? "bg-red-400" : cooldown ? "bg-orange-400" : "bg-emerald-400",
            )}
          />
          {label}
        </Badge>
      )}
      {atSet && (
        <Badge
          variant="outline"
          className="h-8 rounded-full border-primary/35 bg-primary/12 px-3 text-[11px] uppercase tracking-[0.16em] text-primary"
        >
          At setpoint
        </Badge>
      )}
      {held && (
        <Badge
          variant="outline"
          className="h-8 rounded-full border-red-400/40 bg-red-500/15 px-3 text-[11px] uppercase tracking-[0.16em] text-red-100"
        >
          Heat held
        </Badge>
      )}
    </div>
  );
}
