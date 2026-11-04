import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

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
  const styles = useStyles();
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Pressable
          style={styles.toggle}
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={[styles.chevron, expanded && styles.chevronOpen]}>›</Text>
          <Text style={styles.title}>{title}</Text>
        </Pressable>
        {badge}
      </View>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
}

// Ruled rows like the web tree (and the design's TOC): a top rule per row,
// a chevron that turns when open, children indented under the title.
const useStyles = makeStyles((colors) => ({
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
  },
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  chevron: {
    width: 10,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.mutedForeground,
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  title: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
  body: {
    paddingLeft: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
}));
