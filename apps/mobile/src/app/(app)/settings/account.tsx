import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { Overlay } from "@/lib/overlay";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

export default function AccountSettingsScreen() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);

  // No onSuccess handler: signOut() below clears the session, which already
  // takes the user back to the login screen via the root auth redirect.
  const deleteMutation = useMutation({
    mutationFn: () => getApiClient().deleteMe(),
    onSuccess: () => {
      setDeleteOpen(false);
      supabase.auth.signOut();
    },
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
        <Text style={styles.error}>Failed to load account: {(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account</Text>

      <Text style={styles.rowValue}>{data.email}</Text>
      <Pressable
        style={styles.button}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
      <Pressable
        style={styles.dangerButton}
        onPress={() => setDeleteOpen(true)}
        accessibilityRole="button"
      >
        <Text style={styles.dangerButtonText}>Delete Account</Text>
      </Pressable>

      <Overlay
        visible={deleteOpen}
        title="Delete Account"
        onClose={() => setDeleteOpen(false)}
        footer={
          <Pressable
            style={styles.dangerButton}
            onPress={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            accessibilityRole="button"
          >
            <Text style={styles.dangerButtonText}>
              {deleteMutation.isPending ? "Deleting..." : "Delete my account"}
            </Text>
          </Pressable>
        }
      >
        <Text style={styles.rowValue}>
          This will permanently delete your account and all of your data — lessons progress,
          flashcards, notebook entries, everything. This cannot be undone.
        </Text>
        {deleteMutation.isError && (
          <Text style={styles.error}>
            Failed to delete account: {(deleteMutation.error as Error).message}
          </Text>
        )}
      </Overlay>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  centered: {
    justifyContent: "center",
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  rowValue: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  button: {
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
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  dangerButtonText: {
    color: colors.danger,
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
