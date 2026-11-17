import { SettingsSectionScreen } from "@/lib/settings-sections";

/** The profile section on a screen of its own, for links that point straight at
 * it. The phone's Settings page (./index.tsx) renders the same component. */
export default function ProfileSettingsScreen() {
  return <SettingsSectionScreen section="profile" />;
}
