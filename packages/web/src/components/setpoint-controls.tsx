"use client";

import { SETPOINT_MAX, SETPOINT_MIN, SETPOINT_STEP, type StatusResponse } from "@makgrill/shared";
import { setPowerAction, setSetpointAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fieldClass, touchBtnClass } from "@/lib/ui";
import { Panel } from "./panel";

const PRESETS = [180, 200, 225, 250, 275, 300, 350];

export function SetpointControls({ status }: { status: StatusResponse | null }) {
  const locked = !status?.is_online || status.is_cooldown || status.state.power.toUpperCase() !== "ON";
  const current = status?.command.setPoint ?? 175;

  return (
    <Panel className="min-h-[22.5rem]">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-xs font-normal uppercase tracking-[0.24em] text-muted-foreground">
            Setpoint
          </CardTitle>
          <CardDescription className="mt-1">
            {SETPOINT_MIN}–{SETPOINT_MAX}°F, {SETPOINT_STEP}° steps
          </CardDescription>
        </div>
        <div className="min-h-11 min-w-24">
          {status?.state.power.toUpperCase() !== "ON" && !status?.is_cooldown ? (
            <form action={setPowerAction}>
              <input type="hidden" name="state" value={1} />
              <Button type="submit" disabled={!status?.is_online} className={touchBtnClass}>
                Turn on
              </Button>
            </form>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form action={setSetpointAction} className="flex gap-2">
          <Input
            type="number"
            name="temp"
            min={SETPOINT_MIN}
            max={SETPOINT_MAX}
            step={SETPOINT_STEP}
            disabled={locked}
            defaultValue={current}
            key={current}
            className={`${fieldClass} font-mono`}
          />
          <Button type="submit" disabled={locked} className={touchBtnClass}>
            Set
          </Button>
        </form>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <form action={setSetpointAction}>
            <input type="hidden" name="temp" value={current - 5} />
            <Button type="submit" disabled={locked} variant="outline" className={`w-full ${touchBtnClass}`}>
              −5°
            </Button>
          </form>
          <form action={setSetpointAction}>
            <input type="hidden" name="temp" value={current + 5} />
            <Button type="submit" disabled={locked} variant="outline" className={`w-full ${touchBtnClass}`}>
              +5°
            </Button>
          </form>
          {PRESETS.map((temp) => (
            <form action={setSetpointAction} key={temp}>
              <input type="hidden" name="temp" value={temp} />
              <Button type="submit" disabled={locked} variant="outline" className={`w-full ${touchBtnClass}`}>
                {temp}°
              </Button>
            </form>
          ))}
        </div>
      </CardContent>
    </Panel>
  );
}
