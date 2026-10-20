import type { MeResponse } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

export default function NotificationsSettingsScreen() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setNotificationsEnabled(data.settings.notifications_enabled);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getApiClient().updateMe({ notifications_enabled: notificationsEnabled }),
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
      <Text style={styles.title}>Notifications</Text>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Enable notifications</Text>
        <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: fontSizes.base,
    color: colors.foreground,
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
