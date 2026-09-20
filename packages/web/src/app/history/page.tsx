import { localCalendarDay } from "@makgrill/shared";
import { HistoryStudio } from "@/components/history-studio";
import { Shell } from "@/components/shell";
import { loadDays, loadHistory } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const days = await loadDays();
  const selectedDay = days[0]?.day ?? localCalendarDay();
  const initialHistory = await loadHistory({ day: selectedDay });
  return (
    <Shell>
      <HistoryStudio initialDays={days} initialDay={selectedDay} initialHistory={initialHistory} />
    </Shell>
  );
}
