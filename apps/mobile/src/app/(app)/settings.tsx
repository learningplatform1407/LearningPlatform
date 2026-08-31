import type { MeResponse } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

const THEMES = ["light", "dark", "system"] as const;
const LANGUAGES = [{ value: "en", label: "English" }] as const;

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [theme, setTheme] = useState<(typeof THEMES)[number]>("system");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [language, setLanguage] = useState("en");

  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setTheme(data.settings.theme as (typeof THEMES)[number]);
    setNotificationsEnabled(data.settings.notifications_enabled);
    setLanguage(data.settings.language);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      getApiClient().updateMe({
        theme,
        notifications_enabled: notificationsEnabled,
        language,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load settings: {(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

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
      <Text style={styles.hint}>Dark mode isn&apos;t implemented yet — this just saves your preference for later.</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Enable notifications</Text>
        <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
      </View>

      <Text style={styles.label}>Language</Text>
      <View style={styles.segmented}>
        {LANGUAGES.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.segment, language === option.value && styles.segmentActive]}
            onPress={() => setLanguage(option.value)}
            accessibilityRole="button"
          >
            <Text style={[styles.segmentText, language === option.value && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

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

      <Pressable
        style={styles.signOutButton}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  label: {
    marginTop: spacing.sm,
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
  },
  rowLabel: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  saveButton: {
    marginTop: spacing.lg,
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
  signOutButton: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  buttonText: {
    color: colors.foreground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
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
