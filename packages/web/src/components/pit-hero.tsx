"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  SETPOINT_MAX,
  SETPOINT_MIN,
  SETPOINT_STEP,
  clampSetpoint,
  type StatusResponse,
} from "@makgrill/shared";
import { setPowerAction, setSetpointAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { compactTempClass, fieldClass, touchBtnClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

const PRESETS = [180, 200, 225, 250, 275, 300, 350];

function commitSetpoint(temp: number) {
  const fd = new FormData();
  fd.set("temp", String(clampSetpoint(temp)));
  return setSetpointAction(fd);
}

function Gauge({ current, target }: { current: number | null; target: number | null }) {
  const min = 100;
  const max = 500;
  const value = current ?? target ?? min;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const targetPct = target === null ? 0 : Math.max(0, Math.min(1, (target - min) / (max - min)));
  const startDeg = 140;
  const sweepDeg = 260;
  const r = 86;
  const cx = 110;
  const cy = 110;
  const circumference = 2 * Math.PI * r;
  const trackLen = (sweepDeg / 360) * circumference;
  const progressLen = pct * trackLen;
  const polar = (t: number, radius = r) => {
    const a = ((startDeg + sweepDeg * t) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const tick = polar(targetPct);
  const tickInner = polar(targetPct, r - 20);
  const tickOuter = polar(targetPct, r + 18);

  return (
    <svg viewBox="0 0 220 176" className="mx-auto h-44 w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pit-gauge-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c8d2dc" />
          <stop offset="70%" stopColor="#b794f6" />
          <stop offset="100%" stopColor="#8b6cf6" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        strokeWidth="14"
        strokeLinecap="round"
        transform={`rotate(${startDeg} ${cx} ${cy})`}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="rgba(200,210,220,0.2)"
          strokeDasharray={`${trackLen} ${circumference}`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="url(#pit-gauge-steel)"
          strokeDasharray={`${progressLen} ${circumference}`}
        />
      </g>
      {target === null ? null : (
        <>
          <line
            x1={tickInner.x}
            y1={tickInner.y}
            x2={tickOuter.x}
            y2={tickOuter.y}
            stroke="#e8eef4"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <line
            x1={tickInner.x}
            y1={tickInner.y}
            x2={tickOuter.x}
            y2={tickOuter.y}
            stroke="#000000"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx={tick.x} cy={tick.y} r="7" fill="#000000" />
        </>
      )}
    </svg>
  );
}

function isPrimaryPointer(event: { pointerType?: string; button?: number }) {
  return event.pointerType !== "mouse" || event.button === 0 || event.button === undefined;
}

function EditableSetpoint({
  current,
  locked,
  onApplied,
}: {
  /** null = the bridge is not commanding a setpoint (the grill's panel owns it). */
  current: number | null;
  locked: boolean;
  onApplied: (temp: number) => void;
}) {
  const shown = current === null ? "" : String(current);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(shown);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  const draftRef = useRef(draft);
  const lastToggleAt = useRef(0);
  draftRef.current = draft;

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);

  useEffect(() => {
    if (!editing) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    setOpen(true);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-slot='popover-content']")) return;
      applyDraft();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [editing, current]);

  function apply(temp: number) {
    if (!activeRef.current) return;
    activeRef.current = false;
    const next = clampSetpoint(temp);
    setDraft(String(next));
    onApplied(next);
    if (next !== current) void commitSetpoint(next);
    setOpen(false);
    setEditing(false);
  }

  function applyDraft() {
    if (!activeRef.current) return;
    const raw = draftRef.current.trim();
    const parsed = raw === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(parsed)) {
      activeRef.current = false;
      setDraft(shown);
      setOpen(false);
      setEditing(false);
      return;
    }
    apply(parsed);
  }

  function cancel() {
    activeRef.current = false;
    setDraft(shown);
    setOpen(false);
    setEditing(false);
  }

  function startEditing() {
    if (locked) return;
    activeRef.current = true;
    setDraft(shown);
    setEditing(true);
    setOpen(true);
  }

  function togglePresets() {
    const now = Date.now();
    if (now - lastToggleAt.current < 400) return;
    lastToggleAt.current = now;
    setOpen((value) => !value);
  }

  return (
    <div ref={rootRef} className="mt-2 flex min-h-12 items-center justify-end">
      {editing ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="flex w-fit items-center">
              <Input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                min={SETPOINT_MIN}
                max={SETPOINT_MAX}
                step={SETPOINT_STEP}
                value={draft}
                placeholder="°F"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyDraft();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  }
                }}
                className={cn(fieldClass, compactTempClass, "rounded-r-none")}
                aria-label="Setpoint °F"
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Setpoint presets"
                aria-expanded={open}
                className="h-12 min-h-12 w-12 cursor-pointer touch-manipulation rounded-l-none border-l-0 px-0"
                onPointerUp={(event) => {
                  if (!isPrimaryPointer(event)) return;
                  event.preventDefault();
                  togglePresets();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  togglePresets();
                }}
              >
                <ChevronDownIcon />
              </Button>
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="end"
            className="w-36 p-1"
            onOpenAutoFocus={(e: Event) => e.preventDefault()}
            onCloseAutoFocus={(e: Event) => e.preventDefault()}
            onPointerDownOutside={(e: { target: EventTarget | null; preventDefault: () => void }) => {
              if (rootRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
            onInteractOutside={(e: { target: EventTarget | null; preventDefault: () => void }) => {
              if (rootRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
          >
            {PRESETS.map((temp) => (
              <button
                key={temp}
                type="button"
                className={cn(
                  "flex min-h-11 w-full cursor-pointer touch-manipulation items-center rounded-md px-3 font-mono text-sm tabular-nums outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground active:bg-accent active:text-accent-foreground",
                  temp === current && "bg-primary/18 text-primary",
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => {
                  if (!isPrimaryPointer(event)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  apply(temp);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  apply(temp);
                }}
              >
                {temp}°
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : (
        <button
          type="button"
          disabled={locked}
          onPointerUp={(event) => {
            if (locked || !isPrimaryPointer(event)) return;
            event.preventDefault();
            startEditing();
          }}
          onClick={(event) => {
            if (locked) return;
            event.preventDefault();
            startEditing();
          }}
          className="inline-flex min-h-12 min-w-[5.5rem] cursor-pointer touch-manipulation items-center justify-end rounded-xl px-2 font-mono text-4xl leading-none text-primary tabular-nums select-none [-webkit-tap-highlight-color:transparent] disabled:cursor-default disabled:opacity-60"
          aria-label={current === null ? "Set a setpoint (currently set on the grill)" : "Edit setpoint"}
        >
          {current === null ? "--" : current}°
        </button>
      )}
    </div>
  );
}

export function PitHero({ status }: { status: StatusResponse | null }) {
  const ready = status !== null;
  const online = status?.is_online ?? false;
  const pit = online ? Number(status?.state.temp) : null;
  // null: the bridge is not commanding a setpoint this cook; the panel owns it.
  const reported = status ? status.command.setPoint : null;
  const [pendingSetpoint, setPendingSetpoint] = useState<number | null>(null);
  const target = pendingSetpoint ?? reported;

  useEffect(() => {
    if (pendingSetpoint !== null && reported === pendingSetpoint) setPendingSetpoint(null);
  }, [pendingSetpoint, reported]);

  const delta = target !== null && pit !== null && Number.isFinite(pit) ? pit - target : null;
  const pitLabel = pit !== null && Number.isFinite(pit) ? Math.round(pit) : "--";
  const locked = !online || Boolean(status?.is_cooldown) || status?.state.power.toUpperCase() !== "ON";
  const showTurnOn = ready && status.state.power.toUpperCase() !== "ON" && !status.is_cooldown;

  return (
    <Panel className="hero-ring min-h-[22.5rem]">
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
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Setpoint</p>
            {ready ? (
              <EditableSetpoint current={target} locked={locked} onApplied={setPendingSetpoint} />
            ) : (
              <Skeleton className="mt-2 ml-auto h-12 w-20" />
            )}
            <p className="mt-1 h-5 text-sm text-muted-foreground">
              {target === null
                ? "Set on grill"
                : delta === null
                  ? "Awaiting grill"
                  : `${delta > 0 ? "+" : ""}${Math.round(delta)}° vs target`}
            </p>
            {showTurnOn ? (
              <form action={setPowerAction} className="mt-2 flex min-h-11 justify-end">
                <input type="hidden" name="state" value={1} />
                <Button type="submit" disabled={!online} className={touchBtnClass}>
                  Turn on
                </Button>
              </form>
            ) : null}
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
