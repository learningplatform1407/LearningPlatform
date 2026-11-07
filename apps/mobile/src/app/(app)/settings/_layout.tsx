import { Slot, router, usePathname } from "expo-router";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

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
  const styles = useStyles();
  const pathname = usePathname();
  // About two fifths of a phone, so "Subscription & Billing" fits on two
  // lines at the same reading size as the section beside it.
  const { width: screenWidth } = useWindowDimensions();
  const navWidth = Math.min(200, Math.max(148, Math.round(screenWidth * 0.4)));

  return (
    <View style={styles.container}>
      <ScrollView
        style={[styles.nav, { width: navWidth }]}
        contentContainerStyle={styles.navContent}
      >
        <Text style={styles.navTitle}>Settings</Text>
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

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.background,
  },
  // Styled like the lesson's contents list (design.md §6), which is what
  // the web settings nav uses too: 14.5px items, the current one on a soft
  // fill in the heaviest weight.
  nav: {
    flexGrow: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  navContent: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
    gap: 2,
  },
  navTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
    paddingHorizontal: 10,
    paddingBottom: spacing.sm,
  },
  navItem: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: colors.muted,
  },
  navItemText: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  navItemTextActive: {
    fontWeight: fontWeights.extrabold,
  },
  content: {
    flex: 1,
  },
}));
