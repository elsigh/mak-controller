import { HistoryStudio } from "@/components/history-studio";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return (
    <Shell>
      <HistoryStudio />
    </Shell>
  );
}
