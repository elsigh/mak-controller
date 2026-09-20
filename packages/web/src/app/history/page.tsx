import { HistoryStudio } from "@/components/history-studio";
import { Shell } from "@/components/shell";
import { loadHistory, loadSessions } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const sessions = await loadSessions();
  const initialHistory = await loadHistory(sessions[0]?.id ?? null);
  return (
    <Shell>
      <HistoryStudio initialSessions={sessions} initialHistory={initialHistory} />
    </Shell>
  );
}
