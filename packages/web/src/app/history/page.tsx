import { HistoryStudio } from "@/components/history-studio";
import { Shell } from "@/components/shell";
import { loadSessions } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const sessions = await loadSessions();
  return (
    <Shell>
      <HistoryStudio initialSessions={sessions} />
    </Shell>
  );
}
