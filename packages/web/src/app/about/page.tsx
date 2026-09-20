import { AboutStudio } from "@/components/about-studio";
import { Shell } from "@/components/shell";
import { getBuildCommit } from "@/lib/build-info";
import { loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const status = await loadStatus();
  return (
    <Shell>
      <AboutStudio initialStatus={status} buildCommit={getBuildCommit()} />
    </Shell>
  );
}
