import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

/**
 * A disclosure row for the book -> chapter -> sub-chapter -> lesson tree.
 * Mirrors apps/web/src/components/expandable-row.tsx: each row owns its own
 * open state so several branches can stay open at once, and `badge` renders
 * outside the toggle so an interactive badge (a checkbox, in the topic
 * picker) is never nested inside a Pressable.
 */
export function ExpandableRow({
  title,
  badge,
  defaultExpanded = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          style={styles.toggle}
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.arrow}>{expanded ? "▲" : "▼"}</Text>
        </Pressable>
        {badge}
      </View>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  arrow: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
