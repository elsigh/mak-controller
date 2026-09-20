import { Dashboard } from "@/components/dashboard";
import { Shell } from "@/components/shell";
import { loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialStatus = await loadStatus();
  return (
    <Shell>
      <Dashboard initialStatus={initialStatus} />
    </Shell>
  );
}
