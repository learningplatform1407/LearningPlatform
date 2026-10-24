import { Slot, router, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

const SECTIONS = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/billing", label: "Subscription & Billing" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/languages", label: "Languages" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/profile", label: "Profile Settings" },
] as const;

/** Each settings section is its own route (not a tab over client state), the
 * same reasoning as the web layout this mirrors. `<Slot />` renders whichever
 * section route matched, next to the small left nav every section shares --
 * it also still collapses this whole subtree under the single "settings"
 * entry at the (app) level, the same job the old plain `<Stack />` here did
 * (see learn/_layout.tsx for why that matters). */
export default function SettingsLayout() {
  const pathname = usePathname();

  return (
    <View style={styles.container}>
      <ScrollView style={styles.nav} contentContainerStyle={styles.navContent}>
        {SECTIONS.map((section) => {
          const active = pathname === section.href;
          return (
            <Pressable
              key={section.href}
              onPress={() => router.push(section.href)}
              accessibilityRole="button"
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>
                {section.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.background,
  },
  nav: {
    width: 130,
    flexGrow: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  navContent: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  navItem: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
  },
  navItemActive: {
    backgroundColor: colors.primary + "1a",
  },
  navItemText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.mutedForeground,
  },
  navItemTextActive: {
    color: colors.primary,
  },
  content: {
    flex: 1,
  },
});
