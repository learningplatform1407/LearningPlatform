import { StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, fontWeights, radii, spacing } from "@/lib/theme";

/**
 * One number-and-label tile for the Profile screen's statistics section.
 * Mirrors apps/web/src/components/stat-tile.tsx. `emphasis` switches on the
 * hero-trio treatment (larger number, primary border) used for the three
 * stats the user asked for by name — streak, lessons completed, exam
 * average; every other stat renders as a plain secondary tile.
 */
export function StatTile({
  label,
  value,
  sublabel,
  emphasis = false,
}: {
  label: string;
  value: string;
  sublabel?: string;
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.tile, emphasis && styles.tileEmphasis]}>
      <Text style={emphasis ? styles.valueEmphasis : styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sublabel && <Text style={styles.label}>{sublabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  tileEmphasis: {
    borderColor: colors.primary,
  },
  value: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  valueEmphasis: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
});
