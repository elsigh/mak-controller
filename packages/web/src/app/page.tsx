import { localCalendarDay } from "@makgrill/shared";
import { Dashboard } from "@/components/dashboard";
import { Shell } from "@/components/shell";
import { loadHistory, loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = localCalendarDay();
  const [initialStatus, initialHistory] = await Promise.all([
    loadStatus(),
    loadHistory({ day: today }),
  ]);
  return (
    <Shell initialStatus={initialStatus}>
      <Dashboard initialStatus={initialStatus} initialHistory={initialHistory} today={today} />
    </Shell>
  );
}
