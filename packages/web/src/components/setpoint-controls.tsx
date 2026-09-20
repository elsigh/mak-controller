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
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compactTempClass, fieldClass, touchBtnClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";

const PRESETS = [180, 200, 225, 250, 275, 300, 350];

function commitSetpoint(temp: number) {
  const fd = new FormData();
  fd.set("temp", String(clampSetpoint(temp)));
  return setSetpointAction(fd);
}

export function SetpointControls({ status }: { status: StatusResponse | null }) {
  const locked = !status?.is_online || status.is_cooldown || status.state.power.toUpperCase() !== "ON";
  const current = status?.command.setPoint ?? 175;
  const [draft, setDraft] = useState(String(current));
  const [open, setOpen] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(current));
  }, [current]);

  function submit(temp: number) {
    const next = clampSetpoint(temp);
    setDraft(String(next));
    if (next === current) return;
    void commitSetpoint(next);
  }

  function submitDraft() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(current));
      return;
    }
    submit(parsed);
  }

  return (
    <Panel className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-xs font-normal uppercase tracking-[0.24em] text-muted-foreground">
          Setpoint
        </CardTitle>
        {status?.state.power.toUpperCase() !== "ON" && !status?.is_cooldown ? (
          <form action={setPowerAction}>
            <input type="hidden" name="state" value={1} />
            <Button type="submit" disabled={!status?.is_online} className={touchBtnClass}>
              Turn on
            </Button>
          </form>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={locked}
            className={`${touchBtnClass} px-3`}
            onClick={() => submit(current - SETPOINT_STEP)}
          >
            −5
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
              <div className="flex items-center">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={SETPOINT_MIN}
                  max={SETPOINT_MAX}
                  step={SETPOINT_STEP}
                  disabled={locked}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={() => {
                    focused.current = true;
                  }}
                  onBlur={() => {
                    focused.current = false;
                    submitDraft();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className={cn(fieldClass, compactTempClass, "rounded-r-none")}
                  aria-label="Setpoint °F"
                />
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={locked}
                    aria-label="Setpoint presets"
                    className="h-11 w-10 rounded-l-none border-l-0 px-0"
                  >
                    <ChevronDownIcon />
                  </Button>
                </PopoverTrigger>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              className="w-32 p-1"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              {PRESETS.map((temp) => (
                <button
                  key={temp}
                  type="button"
                  className={cn(
                    "flex w-full items-center rounded-md px-2 py-1.5 font-mono text-sm tabular-nums outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                    temp === current && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => {
                    setOpen(false);
                    submit(temp);
                  }}
                >
                  {temp}°
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            disabled={locked}
            className={`${touchBtnClass} px-3`}
            onClick={() => submit(current + SETPOINT_STEP)}
          >
            +5
          </Button>
        </div>
      </CardContent>
    </Panel>
  );
}
