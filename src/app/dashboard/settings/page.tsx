import { Topbar } from "~/components/dashboard/topbar";
import { SettingsContent } from "~/components/settings/settings-content";

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" />
      <SettingsContent />
    </>
  );
}
