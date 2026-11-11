import type { BottomTabBarProps } from "expo-router/tabs";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View, type LayoutRectangle } from "react-native";

import { fontWeights, shadows } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";

import { BookIcon, ExamIcon, FeedIcon, MapIcon, SparkleIcon, UserIcon } from "./icons";

/** Routes that exist in the navigator but aren't places of their own:
 * `index` only redirects to Learn, the others are reached from inside a
 * screen. Same list the tablet drawer filters. */
export const HIDDEN_TAB_ROUTES = new Set(["index", "settings", "question-bank"]);

/** The tab a buttonless screen belongs to, so the pill stays meaningful
 * there: the Question Bank is opened from Learn, Settings from Profile. */
const PARENT_TAB: Record<string, string> = { "question-bank": "learn", settings: "profile" };

const ICONS: Record<string, typeof BookIcon> = {
  learn: BookIcon,
  exams: ExamIcon,
  assistant: SparkleIcon,
  roadmap: MapIcon,
  feed: FeedIcon,
  profile: UserIcon,
};

/**
 * The phone tab bar as a bottom notch (design.md §2, §11): rounded only on
 * the side facing the screen, with a pill that slides to the active tab.
 * The pill is measured from each tab's layout, like the web's NotchTabs.
 */
export function NotchTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
  // Created once; held in state because the animation reads them in render.
  const [pillX] = useState(() => new Animated.Value(0));
  const [pillW] = useState(() => new Animated.Value(0));
  const placed = useRef(false);

  const routes = state.routes.filter((route) => !HIDDEN_TAB_ROUTES.has(route.name));
  const current = state.routes[state.index];
  const parentName = current ? PARENT_TAB[current.name] : undefined;
  const activeKey = parentName
    ? state.routes.find((route) => route.name === parentName)?.key
    : current?.key;
  const active = activeKey ? layouts[activeKey] : undefined;

  useEffect(() => {
    if (!active) return;
    if (!placed.current) {
      // First measurement: put the pill in place without sliding in from 0.
      pillX.setValue(active.x);
      pillW.setValue(active.width);
      placed.current = true;
      return;
    }
    const config = {
      duration: 250,
      easing: Easing.bezier(0.3, 0.7, 0.2, 1),
      useNativeDriver: false,
    };
    Animated.parallel([
      Animated.timing(pillX, { toValue: active.x, ...config }),
      Animated.timing(pillW, { toValue: active.width, ...config }),
    ]).start();
  }, [active, pillX, pillW]);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.row} accessibilityRole="tablist">
        {active ? <Animated.View style={[styles.pill, { left: pillX, width: pillW }]} /> : null}
        {routes.map((route) => {
          const focused = route.key === activeKey;
          const { options } = descriptors[route.key]!;
          const label = typeof options.title === "string" ? options.title : route.name;
          // A count asking for attention (challenges waiting for you).
          const badge = typeof options.tabBarBadge === "number" ? options.tabBarBadge : 0;
          const Icon = ICONS[route.name];
          const color = focused ? colors.foreground : colors.mutedForeground;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                setLayouts((current) => ({ ...current, [route.key]: layout }));
              }}
              onPress={() => {
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                // The real screen, not the highlighted tab: Learn must still
                // navigate when the Question Bank is open.
                if (route.key !== current?.key && !event.defaultPrevented) {
                  navigateToTab(route.key);
                }
              }}
              style={styles.tab}
            >
              <View>
                {Icon ? <Icon color={color} size={20} /> : null}
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={[styles.label, focused && styles.labelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingTop: 8,
    paddingHorizontal: 8,
    ...shadows.notch,
    shadowOffset: { width: 0, height: -6 },
  },
  row: {
    flexDirection: "row",
  },
  pill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: colors.muted,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: fontWeights.semibold,
    color: colors.mutedForeground,
  },
  labelActive: {
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: fontWeights.bold,
    color: colors.background,
  },
}));
