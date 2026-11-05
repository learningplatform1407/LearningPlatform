import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View, type LayoutRectangle } from "react-native";

import { fontWeights, shadows } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

/**
 * Tabs in a notch glued to the top edge, with a pill that slides to the
 * active tab (design.md §3) -- the mobile twin of the web's NotchTabs. The
 * pill is measured from each tab's layout, as the web measures offsetLeft.
 * `header` renders inside the notch above the tabs (the lesson title line).
 */
export function NotchTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
  header,
}: {
  tabs: readonly { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  label: string;
  header?: React.ReactNode;
}) {
  const styles = useStyles();
  const [layouts, setLayouts] = useState<Partial<Record<K, LayoutRectangle>>>({});
  const [pillX] = useState(() => new Animated.Value(0));
  const [pillW] = useState(() => new Animated.Value(0));
  const placed = useRef(false);
  const target = layouts[active];

  useEffect(() => {
    if (!target) return;
    if (!placed.current) {
      placed.current = true;
      pillX.setValue(target.x);
      pillW.setValue(target.width);
      return;
    }
    const config = {
      duration: 250,
      easing: Easing.bezier(0.3, 0.7, 0.2, 1),
      useNativeDriver: false,
    };
    Animated.parallel([
      Animated.timing(pillX, { toValue: target.x, ...config }),
      Animated.timing(pillW, { toValue: target.width, ...config }),
    ]).start();
  }, [target, pillX, pillW]);

  return (
    <View style={styles.notch}>
      {header}
      <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={label}>
        {target ? <Animated.View style={[styles.pill, { left: pillX, width: pillW }]} /> : null}
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.key)}
              onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                setLayouts((current) => ({ ...current, [tab.key]: layout }));
              }}
              style={styles.tab}
            >
              <Text numberOfLines={1} style={[styles.tabText, selected && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  notch: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    ...shadows.notch,
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
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  tabText: {
    fontSize: 15,
    fontWeight: fontWeights.semibold,
    color: colors.mutedForeground,
  },
  tabTextActive: {
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
}));
