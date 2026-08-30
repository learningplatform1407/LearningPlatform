import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

export default function DashboardScreen() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
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
        <Text style={styles.error}>Failed to load profile: {(error as Error).message}</Text>
      </View>
    );
  }

  const rows: [string, string][] = [
    ["Email", data.email ?? "—"],
    ["University", data.university ?? "Not set"],
    ["Theme", data.settings.theme],
    ["Notifications", data.settings.notifications_enabled ? "Enabled" : "Disabled"],
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome{data.display_name ? `, ${data.display_name}` : ""}</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}
      <Pressable
        style={styles.button}
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  rowValue: {
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: spacing.md,
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
