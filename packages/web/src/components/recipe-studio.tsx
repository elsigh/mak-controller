"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatStageRule, type Recipe, type RecipeStage, type StatusResponse, type TriggerType } from "@makgrill/shared";
import { startSavedRecipeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStatus } from "@/hooks/use-status";
import { api } from "@/lib/api";
import { fieldClass, touchBtnClass } from "@/lib/ui";
import { PageHeader } from "./page-header";
import { Panel } from "./panel";
import { RecipeRunner } from "./recipe-runner";
import { SessionCard } from "./session-card";

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
      <PageHeader
        title="Recipes"
        description="Multi-stage cooks that advance by time, probe temperature, or an indefinite hold."
      />
      <RecipeRunner status={status} onChange={refresh} />
      <SessionCard status={status} />
      <Panel className="min-h-[12rem]">
        <CardHeader>
          <form method="get" action="/recipes" className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Label className="flex-1 flex-col items-stretch gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Saved recipes
              <select
                name="id"
                defaultValue={selectedId}
                className={`${fieldClass} w-full rounded-lg border border-input bg-input/30 px-3 normal-case tracking-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`}
              >
                <option value="">Select a recipe</option>
                <option value="new">+ Create new recipe</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
            </Label>
            <Button type="submit" className={touchBtnClass}>
              Load
            </Button>
          </form>
        </CardHeader>
        {stages.length > 0 && (
          <CardContent className="space-y-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Recipe name"
              className={fieldClass}
            />
            <ol className="space-y-3">
              {stages.map((stage, index) => (
                <li key={`${stage.name}-${index}`} className="rounded-2xl border border-border bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-primary">Stage {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setStages((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Label className="flex-col items-stretch gap-1 text-xs text-muted-foreground md:col-span-2">
                      Name
                      <Input
                        value={stage.name}
                        onChange={(e) => updateStage(index, { name: e.target.value })}
                        className={fieldClass}
                      />
                    </Label>
                    <Label className="flex-col items-stretch gap-1 text-xs text-muted-foreground">
                      Setpoint
                      <Input
                        type="number"
                        min={150}
                        max={500}
                        step={5}
                        value={stage.setpoint}
                        onChange={(e) => updateStage(index, { setpoint: Number(e.target.value) })}
                        className={fieldClass}
                      />
                    </Label>
                    <Label className="flex-col items-stretch gap-1 text-xs text-muted-foreground">
                      Trigger
                      <Select
                        value={stage.trigger_type}
                        onValueChange={(value: string) => updateStage(index, { trigger_type: value as TriggerType })}
                      >
                        <SelectTrigger className={`${fieldClass} w-full`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="time">Time (min)</SelectItem>
                          <SelectItem value="probe1">Probe 1</SelectItem>
                          <SelectItem value="probe2">Probe 2</SelectItem>
                          <SelectItem value="probe3">Probe 3</SelectItem>
                          <SelectItem value="hold">Hold</SelectItem>
                        </SelectContent>
                      </Select>
                    </Label>
                    <Label className="flex-col items-stretch gap-1 text-xs text-muted-foreground">
                      Value
                      <Input
                        type="number"
                        disabled={stage.trigger_type === "hold"}
                        value={stage.trigger_val}
                        onChange={(e) => updateStage(index, { trigger_val: Number(e.target.value) })}
                        className={fieldClass}
                      />
                    </Label>
                  </div>
                  {stage.trigger_type.startsWith("probe") && (
                    <Label className="mt-3 flex-col items-stretch gap-1 text-xs text-muted-foreground">
                      Condition
                      <Select
                        value={stage.trigger_cond}
                        onValueChange={(value: string) =>
                          updateStage(index, { trigger_cond: value === "lte" ? "lte" : "gte" })
                        }
                      >
                        <SelectTrigger className={`${fieldClass} w-full md:max-w-xs`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gte">Above or equal</SelectItem>
                          <SelectItem value="lte">Below or equal</SelectItem>
                        </SelectContent>
                      </Select>
                    </Label>
                  )}
                  <p className="mt-3 min-h-5 text-sm text-muted-foreground">{formatStageRule(stage)}</p>
                </li>
              ))}
            </ol>
            <Button type="button" variant="outline" className={touchBtnClass} onClick={() => setStages((current) => [...current, emptyStage(current.length)])}>
              Add stage
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className={touchBtnClass} onClick={() => void save()}>
                Save recipe
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="destructive" disabled={typeof selected !== "number"} className={touchBtnClass}>
                    Delete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete recipe?</DialogTitle>
                    <DialogDescription>
                      This removes {name || "the selected recipe"} from the local library.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="destructive" onClick={() => void remove()}>
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {typeof selected === "number" && (
                <form action={startSavedRecipeAction}>
                  <input type="hidden" name="id" value={selected} />
                  <Button type="submit" className={touchBtnClass}>
                    Start automated recipe
                  </Button>
                </form>
              )}
            </div>
            {message ? <p className="min-h-5 text-sm text-emerald-300">{message}</p> : <p className="min-h-5" />}
          </CardContent>
        )}
      </Panel>
    </div>
  );
}
