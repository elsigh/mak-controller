import { RecipeStudio } from "@/components/recipe-studio";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default function RecipesPage() {
  return (
    <Shell>
      <RecipeStudio />
    </Shell>
  );
}
