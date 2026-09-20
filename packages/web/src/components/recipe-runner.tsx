"use client";

import { formatStageRule, type StatusResponse } from "@makgrill/shared";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { touchBtnClass } from "@/lib/ui";
import { Panel } from "./panel";

export function RecipeRunner({
  status,
  onChange,
}: {
  status: StatusResponse | null;
  onChange: () => Promise<void> | void;
}) {
  const auto = status?.automation;
  if (!auto?.active || !auto.current_stage) return null;
  const minutes = Math.floor(auto.stage_elapsed_sec / 60);
  const seconds = Math.floor(auto.stage_elapsed_sec % 60);

  return (
    <Panel className="border-primary/30">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-primary">Recipe running</p>
          <CardTitle className="mt-1 text-xl">{auto.name}</CardTitle>
        </div>
        <Badge
          variant="outline"
          className="h-8 rounded-full border-emerald-400/30 bg-emerald-500/15 px-3 text-[11px] uppercase tracking-[0.16em] text-emerald-200"
        >
          Stage {auto.stage_idx + 1} / {auto.total_stages}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-black/25 p-4">
          <p className="font-medium">{auto.current_stage.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {auto.current_stage.setpoint}°F · {formatStageRule(auto.current_stage)}
          </p>
          <p className="mt-2 font-mono text-sm text-primary">
            Elapsed {minutes}m {seconds}s
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className={touchBtnClass} onClick={() => void api.nextStage().then(onChange)}>
            Skip stage
          </Button>
          <Button
            type="button"
            variant="destructive"
            className={touchBtnClass}
            onClick={() => void api.stopAutomation().then(onChange)}
          >
            Cancel recipe
          </Button>
        </div>
      </CardContent>
    </Panel>
  );
}
