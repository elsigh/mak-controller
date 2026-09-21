import { SettingsStudio } from "@/components/settings-studio";
import { Shell } from "@/components/shell";
import { loadSettings, loadStatus } from "@/lib/load-bridge";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [status, settings] = await Promise.all([loadStatus(), loadSettings()]);
  return (
    <Shell initialStatus={status}>
      <SettingsStudio initialStatus={status} initialSettings={settings} />
    </Shell>
  );
}
