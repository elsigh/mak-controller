"use client";

import type { StatusResponse } from "@makgrill/shared";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "./panel";

function Gauge({ current, target }: { current: number | null; target: number }) {
  const min = 100;
  const max = 500;
  const value = current ?? target;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const targetPct = Math.max(0, Math.min(1, (target - min) / (max - min)));
  const start = 140;
  const sweep = 260;
  const r = 86;
  const cx = 110;
  const cy = 110;
  const polar = (t: number) => {
    const a = ((start + sweep * t) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const a = polar(0);
  const b = polar(pct);
  const large = pct > 0.5 ? 1 : 0;
  const tick = polar(targetPct);

  return (
    <svg viewBox="0 0 220 170" className="h-44 w-full">
      <path
        d={`M ${polar(0).x} ${polar(0).y} A ${r} ${r} 0 1 1 ${polar(1).x} ${polar(1).y}`}
        fill="none"
        stroke="rgba(255,214,170,0.12)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d={`M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`}
        fill="none"
        stroke="url(#ember)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <circle cx={tick.x} cy={tick.y} r="5" fill="#f5a524" />
      <defs>
        <linearGradient id="ember" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5a524" />
          <stop offset="100%" stopColor="#ff6a2a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PitHero({ status }: { status: StatusResponse | null }) {
  const ready = status !== null;
  const online = status?.is_online ?? false;
  const pit = online ? Number(status?.state.temp) : null;
  const target = status?.command.setPoint ?? 175;
  const delta = pit !== null && Number.isFinite(pit) ? pit - target : null;
  const pitLabel = pit !== null && Number.isFinite(pit) ? Math.round(pit) : "--";

  return (
    <Panel className="ember-ring min-h-[22.5rem]">
      <CardHeader className="gap-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Pit temperature</p>
            {ready ? (
              <p className="mt-2 h-16 font-mono text-6xl leading-none font-semibold tracking-tight tabular-nums sm:h-[4.5rem] sm:text-7xl">
                {pitLabel}
                <span className="ml-1 text-2xl text-primary">°F</span>
              </p>
            ) : (
              <Skeleton className="mt-2 h-16 w-44 sm:h-[4.5rem]" />
            )}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Commanded</p>
            {ready ? (
              <p className="mt-2 h-12 font-mono text-4xl leading-none text-primary tabular-nums">{target}°</p>
            ) : (
              <Skeleton className="mt-2 ml-auto h-12 w-20" />
            )}
            <p className="mt-1 h-5 text-sm text-muted-foreground">
              {delta === null ? "Awaiting grill" : `${delta > 0 ? "+" : ""}${Math.round(delta)}° vs target`}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-44">
          <Gauge current={pit !== null && Number.isFinite(pit) ? pit : null} target={target} />
        </div>
      </CardContent>
    </Panel>
  );
}
