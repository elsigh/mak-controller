import { Dashboard } from "@/components/dashboard";
import { Shell } from "@/components/shell";
import { loadHistory, loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialStatus = await loadStatus();
  const initialHistory = await loadHistory(initialStatus?.active_session?.id ?? null);
  return (
    <Shell>
      <Dashboard initialStatus={initialStatus} initialHistory={initialHistory} />
    </Shell>
  );
}
