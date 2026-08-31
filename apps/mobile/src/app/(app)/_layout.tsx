import { Drawer, DrawerContentScrollView, DrawerItem } from "expo-router/drawer";
import { Tabs } from "expo-router/tabs";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { colors, spacing } from "@/lib/theme";

import type { DrawerContentComponentProps } from "expo-router/drawer";

const TABLET_BREAKPOINT = 768;

function AppDrawerContent({ state, navigation, descriptors }: DrawerContentComponentProps) {
  const activeKey = state.routes[state.index]?.key;
  const profileIndex = state.routes.findIndex((route) => route.name === "profile");
  const topRoutes = state.routes.filter((_, index) => index !== profileIndex);
  const profileRoute = profileIndex >= 0 ? state.routes[profileIndex] : undefined;

  const renderItem = (route: (typeof state.routes)[number], isProfile: boolean) => {
    const drawerLabel = descriptors[route.key]?.options.drawerLabel;
    return (
      <DrawerItem
        key={route.key}
        label={typeof drawerLabel === "string" ? drawerLabel : route.name}
        focused={activeKey === route.key}
        activeTintColor={colors.foreground}
        inactiveTintColor={colors.mutedForeground}
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

const styles = StyleSheet.create({
  drawerContent: {
    flexGrow: 1,
    paddingVertical: spacing.md,
  },
  spacer: {
    flexGrow: 1,
  },
  profileItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
});

export default function AppLayout() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  if (isTablet) {
    return (
      <Drawer
        drawerContent={(props) => <AppDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: "permanent",
        }}
      >
        <Drawer.Screen name="lectures" options={{ drawerLabel: "Lectures" }} />
        <Drawer.Screen name="assistant" options={{ drawerLabel: "AI Assistant" }} />
        <Drawer.Screen name="roadmap" options={{ drawerLabel: "Roadmap" }} />
        <Drawer.Screen name="feed" options={{ drawerLabel: "Feed" }} />
        <Drawer.Screen name="profile" options={{ drawerLabel: "Profile" }} />
      </Drawer>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.mutedForeground,
      }}
    >
      <Tabs.Screen name="lectures" options={{ title: "Lectures" }} />
      <Tabs.Screen name="assistant" options={{ title: "AI Assistant" }} />
      <Tabs.Screen name="roadmap" options={{ title: "Roadmap" }} />
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
