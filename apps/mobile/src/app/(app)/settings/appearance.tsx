import type { MeResponse } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader, SegmentedSwitch } from "@/lib/ui/primitives";

const THEME_CHOICES = ["light", "dark", "system"] as const;

type ThemeChoice = (typeof THEME_CHOICES)[number];

export default function AppearanceSettingsScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [theme, setTheme] = useState<ThemeChoice>("system");

  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setTheme(data.settings.theme as ThemeChoice);
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getApiClient().updateMe({ theme }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
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

  return (
    <View style={styles.container}>
      <ScreenHeader kicker={t("settings.title")} title={t("settings.sections.appearance")} />

      <Text style={styles.label}>{t("settings.appearance.theme")}</Text>
      <SegmentedSwitch
        label={t("settings.appearance.theme")}
        options={THEME_CHOICES.map((value) => ({
          value,
          label: t(`settings.appearance.${value}`),
        }))}
        value={theme}
        onChange={setTheme}
      />
      <Text style={styles.hint}>{t("settings.appearance.hintMobile")}</Text>

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
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
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
