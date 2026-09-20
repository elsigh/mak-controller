"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatStageRule, type Recipe, type RecipeStage, type StatusResponse, type TriggerType } from "@makgrill/shared";
import { startSavedRecipeAction } from "@/app/actions";
import { useStatus } from "@/hooks/use-status";
import { api } from "@/lib/api";
import { RecipeRunner } from "./recipe-runner";

const emptyStage = (index: number): RecipeStage => ({
  name: `Stage ${index + 1}`,
  setpoint: 225,
  trigger_type: "time",
  trigger_cond: "gte",
  trigger_val: 60,
});

export function RecipeStudio({
  initialRecipes = [],
  initialStatus = null,
  selectedId = "",
  initialName = "",
  initialStages = [],
}: {
  initialRecipes?: Recipe[];
  initialStatus?: StatusResponse | null;
  selectedId?: string;
  initialName?: string;
  initialStages?: RecipeStage[];
}) {
  const router = useRouter();
  const { status, refresh } = useStatus(2500, initialStatus);
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const selected = selectedId === "new" ? "new" : selectedId ? Number(selectedId) : "";
  const [name, setName] = useState(initialName);
  const [stages, setStages] = useState<RecipeStage[]>(initialStages);
  const [message, setMessage] = useState("");

  async function load() {
    setRecipes(await api.recipes());
  }

  function updateStage(index: number, patch: Partial<RecipeStage>) {
    setStages((current) => current.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));
  }

  async function save() {
    if (!name.trim() || stages.length === 0) return;
    const result = await api.saveRecipe({
      id: typeof selected === "number" ? selected : null,
      name,
      stages,
    });
    setMessage("Recipe saved");
    await load();
    router.push(`/recipes?id=${result.id}`);
    router.refresh();
  }

  async function remove() {
    if (typeof selected !== "number") return;
    await api.deleteRecipe(selected);
    router.push("/recipes");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Recipes</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Multi-stage cooks that advance by time, probe temperature, or an indefinite hold.
        </p>
      </div>
      <RecipeRunner status={status} onChange={refresh} />
      <section className="panel rounded-3xl p-5">
        <form method="get" action="/recipes" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Saved recipes
            <select
              name="id"
              defaultValue={selectedId}
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3 normal-case tracking-normal text-base text-[var(--ink)]"
            >
              <option value="">Select a recipe</option>
              <option value="new">+ Create new recipe</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-2xl bg-amber-400 px-5 py-3 font-semibold text-black">
            Load
          </button>
        </form>
        {stages.length > 0 && (
          <div className="mt-5 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Recipe name"
              className="w-full rounded-2xl border border-[var(--line)] bg-black/30 px-4 py-3"
            />
            <ol className="space-y-3">
              {stages.map((stage, index) => (
                <li key={`${stage.name}-${index}`} className="rounded-2xl border border-[var(--line)] bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Stage {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => setStages((current) => current.filter((_, i) => i !== index))}
                      className="text-sm text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-5">
                    <label className="text-xs text-[var(--muted)] md:col-span-2">
                      Name
                      <input
                        value={stage.name}
                        onChange={(e) => updateStage(index, { name: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2"
                      />
                    </label>
                    <label className="text-xs text-[var(--muted)]">
                      Setpoint
                      <input
                        type="number"
                        min={150}
                        max={500}
                        step={5}
                        value={stage.setpoint}
                        onChange={(e) => updateStage(index, { setpoint: Number(e.target.value) })}
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2"
                      />
                    </label>
                    <label className="text-xs text-[var(--muted)]">
                      Trigger
                      <select
                        value={stage.trigger_type}
                        onChange={(e) => updateStage(index, { trigger_type: e.target.value as TriggerType })}
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2"
                      >
                        <option value="time">Time (min)</option>
                        <option value="probe1">Probe 1</option>
                        <option value="probe2">Probe 2</option>
                        <option value="probe3">Probe 3</option>
                        <option value="hold">Hold</option>
                      </select>
                    </label>
                    <label className="text-xs text-[var(--muted)]">
                      Value
                      <input
                        type="number"
                        disabled={stage.trigger_type === "hold"}
                        value={stage.trigger_val}
                        onChange={(e) => updateStage(index, { trigger_val: Number(e.target.value) })}
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 disabled:opacity-40"
                      />
                    </label>
                  </div>
                  {stage.trigger_type.startsWith("probe") && (
                    <label className="mt-3 block text-xs text-[var(--muted)]">
                      Condition
                      <select
                        value={stage.trigger_cond}
                        onChange={(e) => updateStage(index, { trigger_cond: e.target.value === "lte" ? "lte" : "gte" })}
                        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 md:max-w-xs"
                      >
                        <option value="gte">Above or equal</option>
                        <option value="lte">Below or equal</option>
                      </select>
                    </label>
                  )}
                  <p className="mt-3 text-sm text-[var(--muted)]">{formatStageRule(stage)}</p>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setStages((current) => [...current, emptyStage(current.length)])}
              className="rounded-2xl border border-[var(--line)] px-4 py-2"
            >
              Add stage
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void save()} className="rounded-2xl bg-sky-500 px-4 py-2 font-semibold">
                Save recipe
              </button>
              <button
                type="button"
                disabled={typeof selected !== "number"}
                onClick={() => void remove()}
                className="rounded-2xl bg-red-600 px-4 py-2 disabled:opacity-40"
              >
                Delete
              </button>
              {typeof selected === "number" && (
                <form action={startSavedRecipeAction}>
                  <input type="hidden" name="id" value={selected} />
                  <button type="submit" className="rounded-2xl bg-amber-400 px-4 py-2 font-semibold text-black">
                    Start automated recipe
                  </button>
                </form>
              )}
            </div>
            {message && <p className="text-sm text-emerald-300">{message}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
