"use client";

import { formatStageRule, type StatusResponse } from "@makgrill/shared";
import { api } from "@/lib/api";

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
    <section className="panel rounded-3xl border-amber-400/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-amber-300">Recipe running</p>
          <p className="mt-1 text-xl font-semibold">{auto.name}</p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs uppercase tracking-[0.16em] text-emerald-200">
          Stage {auto.stage_idx + 1} / {auto.total_stages}
        </span>
      </div>
      <div className="mt-4 rounded-2xl bg-black/25 p-4">
        <p className="font-medium">{auto.current_stage.name}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {auto.current_stage.setpoint}°F · {formatStageRule(auto.current_stage)}
        </p>
        <p className="mt-2 font-mono text-sm text-amber-200">
          Elapsed {minutes}m {seconds}s
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void api.nextStage().then(onChange)}
          className="rounded-2xl border border-[var(--line)] px-4 py-2"
        >
          Skip stage
        </button>
        <button
          type="button"
          onClick={() => void api.stopAutomation().then(onChange)}
          className="rounded-2xl bg-red-600 px-4 py-2"
        >
          Cancel recipe
        </button>
      </div>
    </section>
  );
}
