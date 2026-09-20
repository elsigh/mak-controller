import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Recipes stay on the bridge API but are hidden from the product UI. */
export default function RecipesPage() {
  redirect("/");
}
