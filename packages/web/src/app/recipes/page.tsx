import { RecipeStudio } from "@/components/recipe-studio";
import { Shell } from "@/components/shell";
import { loadRecipes, loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const [{ id = "" }, recipes, status] = await Promise.all([
    searchParams,
    loadRecipes(),
    loadStatus(),
  ]);

  const selectedRecipe = id && id !== "new" ? recipes.find((recipe) => String(recipe.id) === id) : undefined;

  return (
    <Shell>
      <RecipeStudio
        initialRecipes={recipes}
        initialStatus={status}
        selectedId={id}
        initialName={selectedRecipe?.name ?? ""}
        initialStages={id === "new" ? [{ name: "Stage 1", setpoint: 225, trigger_type: "time", trigger_cond: "gte", trigger_val: 60 }] : (selectedRecipe?.stages ?? [])}
      />
    </Shell>
  );
}
