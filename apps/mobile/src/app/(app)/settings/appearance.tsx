import type { MeResponse } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

const THEMES = ["light", "dark", "system"] as const;

export default function AppearanceSettingsScreen() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [theme, setTheme] = useState<(typeof THEMES)[number]>("system");

  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setTheme(data.settings.theme as (typeof THEMES)[number]);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getApiClient().updateMe({ theme }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  if (isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.error}>Failed to load settings: {(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Appearance</Text>

      <Text style={styles.label}>Theme</Text>
      <View style={styles.segmented}>
        {THEMES.map((option) => (
          <Pressable
            key={option}
            style={[styles.segment, theme === option && styles.segmentActive]}
            onPress={() => setTheme(option)}
            accessibilityRole="button"
          >
            <Text style={[styles.segmentText, theme === option && styles.segmentTextActive]}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        Dark mode isn&apos;t implemented yet — this just saves your preference for later.
      </Text>

      {saveMutation.isError && (
        <Text style={styles.error}>Failed to save: {(saveMutation.error as Error).message}</Text>
      )}
      <Pressable
        style={styles.saveButton}
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        accessibilityRole="button"
      >
        <Text style={styles.saveButtonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
      </Pressable>
      {saveMutation.isSuccess && <Text style={styles.saved}>Saved.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: "center",
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.xs / 2,
    alignSelf: "flex-start",
  },
  segment: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 6,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  segmentTextActive: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
  },
  saveButton: {
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  saved: {
    fontSize: fontSizes.sm,
    color: colors.success,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
});
