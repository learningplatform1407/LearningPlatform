import { Drawer, DrawerContentScrollView, DrawerItem } from "expo-router/drawer";
import { Tabs } from "expo-router/tabs";
import { useWindowDimensions, View } from "react-native";

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
        <Drawer.Screen name="learn" options={{ drawerLabel: "Learn" }} />
        <Drawer.Screen name="exams" options={{ drawerLabel: "Exam Hub" }} />
        <Drawer.Screen name="assistant" options={{ drawerLabel: "AI Assistant" }} />
        <Drawer.Screen name="roadmap" options={{ drawerLabel: "Roadmap" }} />
        <Drawer.Screen name="feed" options={{ drawerLabel: "Feed" }} />
        <Drawer.Screen name="profile" options={{ drawerLabel: "Profile" }} />
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
      <Tabs.Screen name="learn" options={{ title: "Learn" }} />
      <Tabs.Screen name="exams" options={{ title: "Exam Hub" }} />
      <Tabs.Screen name="assistant" options={{ title: "AI Assistant" }} />
      <Tabs.Screen name="roadmap" options={{ title: "Roadmap" }} />
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      {/* Reachable only from inside Learn, not as its own tab — see the
          NAV_ITEMS comment in apps/web/src/components/sidebar.tsx. */}
      <Tabs.Screen name="question-bank" options={{ href: null }} />
    </Tabs>
  );
}
