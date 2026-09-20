import { SettingsStudio } from "@/components/settings-studio";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <Shell>
      <SettingsStudio />
    </Shell>
  );
}
