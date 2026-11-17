import { Stack } from "expo-router";

import { useThemeColors } from "@/lib/theme-context";

/**
 * Settings is one page on a phone (./index.tsx), so this is a plain stack --
 * no left nav.
 *
 * The nav it replaces was the web layout's, ported: a list of seven sections
 * taking two fifths of the screen, next to a pane holding the one or two
 * controls the chosen section had. On a phone that is a menu standing between
 * the reader and a page that fits on a page. The section routes are still
 * here for the links that point straight at them, and `<Stack />` still
 * collapses this whole subtree under the single "settings" entry at the (app)
 * level (see learn/_layout.tsx for why that matters).
 */
export default function SettingsLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
