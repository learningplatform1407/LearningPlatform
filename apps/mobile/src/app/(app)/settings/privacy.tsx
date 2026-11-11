import type { MeResponse } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Switch, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

export default function PrivacySettingsScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [profilePublic, setProfilePublic] = useState(false);

  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setProfilePublic(data.settings.profile_public);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getApiClient().updateMe({ profile_public: profilePublic }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      // Who appears in other people's lists just changed.
      void queryClient.invalidateQueries({ queryKey: ["followers"] });
      void queryClient.invalidateQueries({ queryKey: ["following"] });
    },
  });

  if (isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.error}>
          {t("common.failedToLoadSettings", { message: (error as Error).message })}
        </Text>
      </View>
    );
  }

  // Search is by name only, so the API refuses a nameless public profile.
  const needsName = !data.display_name?.trim();

  return (
    <View style={styles.container}>
      <ScreenHeader kicker={t("settings.title")} title={t("settings.sections.privacy")} />

      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t("settings.privacy.publicProfile")}</Text>
        <Switch
          value={profilePublic}
          onValueChange={setProfilePublic}
          disabled={needsName && !profilePublic}
          accessibilityLabel={t("settings.privacy.publicProfile")}
        />
      </View>
      <Text style={styles.hint}>{t("settings.privacy.publicHint")}</Text>
      {needsName && (
        <Pressable onPress={() => router.push("/settings/profile")} accessibilityRole="link">
          <Text style={styles.link}>{t("settings.privacy.needsName")}</Text>
        </Pressable>
      )}

      {saveMutation.isError && (
        <Text style={styles.error}>
          {t("common.failedToSave", { message: (saveMutation.error as Error).message })}
        </Text>
      )}
      <Pressable
        style={styles.saveButton}
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        accessibilityRole="button"
      >
        <Text style={styles.saveButtonText}>
          {saveMutation.isPending ? t("common.saving") : t("common.save")}
        </Text>
      </Pressable>
      {saveMutation.isSuccess && <Text style={styles.saved}>{t("common.saved")}</Text>}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: "center",
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
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  link: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  saveButton: {
    borderRadius: 10,
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
}));
