import { Drawer, DrawerContentScrollView, DrawerItem } from "expo-router/drawer";
import { Tabs } from "expo-router/tabs";
import { useWindowDimensions, View } from "react-native";

import { useI18n } from "@/lib/i18n";
import { fontWeights, spacing } from "@/lib/theme";

import type { DrawerContentComponentProps } from "expo-router/drawer";
import { HIDDEN_TAB_ROUTES, NotchTabBar } from "@/lib/ui/notch-tab-bar";
import { makeStyles, useThemeColors } from "@/lib/theme-context";

const TABLET_BREAKPOINT = 768;

function AppDrawerContent({ state, navigation, descriptors }: DrawerContentComponentProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const activeKey = state.routes[state.index]?.key;
  // "settings" and "question-bank" are registered with
  // options={{ href: null }} for parity with the Tabs branch, but Expo
  // Router's href:null hiding only affects the default tab-bar/drawer
  // renderers — since this is a custom drawerContent, they're filtered out
  // here directly instead. "settings" is reachable only via router.push
  // from the Profile screen; "question-bank" only from inside Learn.
  // "index" joins them: it exists only to redirect `/` to Learn, so it is a
  // route rather than a place, and would otherwise show up as a nameless
  // drawer item above Learn.
  const visibleRoutes = state.routes.filter((route) => !HIDDEN_TAB_ROUTES.has(route.name));
  const profileIndex = visibleRoutes.findIndex((route) => route.name === "profile");
  const topRoutes = visibleRoutes.filter((_, index) => index !== profileIndex);
  const profileRoute = profileIndex >= 0 ? visibleRoutes[profileIndex] : undefined;

  const renderItem = (route: (typeof state.routes)[number], isProfile: boolean) => {
    const drawerLabel = descriptors[route.key]?.options.drawerLabel;
    return (
      <DrawerItem
        key={route.key}
        label={typeof drawerLabel === "string" ? drawerLabel : route.name}
        focused={activeKey === route.key}
        activeTintColor={colors.foreground}
        inactiveTintColor={colors.foreground}
        activeBackgroundColor={colors.muted}
        labelStyle={activeKey === route.key ? styles.drawerItemLabelActive : styles.drawerItemLabel}
        onPress={() => navigation.navigate(route.name)}
        style={isProfile ? styles.profileItem : undefined}
      />
    );
  };

  return (
    <DrawerContentScrollView contentContainerStyle={styles.drawerContent}>
      {topRoutes.map((route) => renderItem(route, false))}
      <View style={styles.spacer} />
      {profileRoute ? renderItem(profileRoute, true) : null}
    </DrawerContentScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  drawerContent: {
    flexGrow: 1,
    paddingVertical: spacing.md,
  },
  spacer: {
    flexGrow: 1,
  },
  drawerItemLabel: {
    fontSize: 14.5,
    fontWeight: fontWeights.semibold,
  },
  drawerItemLabelActive: {
    fontSize: 14.5,
    fontWeight: fontWeights.extrabold,
  },
  profileItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
}));

export default function AppLayout() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  if (isTablet) {
    return (
      <Drawer
        drawerContent={(props) => <AppDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: "permanent",
          drawerStyle: {
            width: 240,
            backgroundColor: colors.background,
            borderRightColor: colors.border,
          },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        {/* Answers `/` and redirects to Learn; AppDrawerContent filters it
            out of the visible items. */}
        <Drawer.Screen name="index" />
        <Drawer.Screen name="learn" options={{ drawerLabel: t("nav.learn") }} />
        <Drawer.Screen name="exams" options={{ drawerLabel: t("nav.exams") }} />
        <Drawer.Screen name="assistant" options={{ drawerLabel: t("nav.assistant") }} />
        <Drawer.Screen name="roadmap" options={{ drawerLabel: t("nav.roadmap") }} />
        <Drawer.Screen name="feed" options={{ drawerLabel: t("nav.feed") }} />
        <Drawer.Screen name="profile" options={{ drawerLabel: t("nav.profile") }} />
        {/* No `href: null` here — Drawer's options type doesn't support it, and
            AppDrawerContent above already filters "settings" and
            "question-bank" out by name. */}
        <Drawer.Screen name="settings" />
        <Drawer.Screen name="question-bank" />
      </Drawer>
    );
  }

  return (
    <Tabs
      tabBar={(props) => <NotchTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Answers `/` and redirects to Learn — not a tab of its own. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="learn" options={{ title: t("nav.learn") }} />
      <Tabs.Screen name="exams" options={{ title: t("nav.exams") }} />
      <Tabs.Screen name="assistant" options={{ title: t("nav.assistant") }} />
      <Tabs.Screen name="roadmap" options={{ title: t("nav.roadmap") }} />
      <Tabs.Screen name="feed" options={{ title: t("nav.feed") }} />
      <Tabs.Screen name="profile" options={{ title: t("nav.profile") }} />
      {/* Settings (from Profile) and the Question Bank (from Learn) are real
          tabs without a button: NotchTabBar leaves them out by name. Not
          `href: null` -- since Expo Router 58 that hides the route itself,
          and navigating to a hidden tab redirects to the first one, so both
          screens were unreachable on a phone. */}
      <Tabs.Screen name="settings" options={{ title: t("nav.settings") }} />
      <Tabs.Screen name="question-bank" options={{ title: t("nav.questionBank") }} />
    </Tabs>
  );
}
