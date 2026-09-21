import { localCalendarDay } from "@makgrill/shared";
import { HistoryStudio } from "@/components/history-studio";
import { Shell } from "@/components/shell";
import { loadDays, loadHistory, loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [days, initialStatus] = await Promise.all([loadDays(), loadStatus()]);
  const selectedDay = days[0]?.day ?? localCalendarDay();
  const initialHistory = await loadHistory({ day: selectedDay });
  return (
    <Shell initialStatus={initialStatus}>
      <HistoryStudio initialDays={days} initialDay={selectedDay} initialHistory={initialHistory} />
    </Shell>
  );
}
