import { AllSettingsScreen } from "@/lib/settings-sections";

/**
 * Settings on a phone: every section on one page, one under another.
 *
 * This used to redirect straight to /settings/account, because a section was
 * only reachable through the left nav beside it. There is no nav now, so this
 * is the screen.
 */
export default function SettingsIndexScreen() {
  return <AllSettingsScreen />;
}
