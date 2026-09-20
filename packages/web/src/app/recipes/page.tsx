import { RecipeStudio } from "@/components/recipe-studio";
import { Shell } from "@/components/shell";
import { loadRecipes, loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const [recipes, status] = await Promise.all([loadRecipes(), loadStatus()]);
  return (
    <Shell>
      <RecipeStudio initialRecipes={recipes} initialStatus={status} />
    </Shell>
  );
}
