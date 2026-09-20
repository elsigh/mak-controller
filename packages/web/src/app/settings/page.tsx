import { SettingsStudio } from "@/components/settings-studio";
import { Shell } from "@/components/shell";
import { loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const status = await loadStatus();
  return (
    <Shell>
      <SettingsStudio initialStatus={status} />
    </Shell>
  );
}
