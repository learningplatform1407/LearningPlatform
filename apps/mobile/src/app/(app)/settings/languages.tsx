import type { MeResponse } from "@lp/contracts";
import { LANGUAGE_NAMES, LANGUAGES, resolveLanguage, type Language } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

export default function LanguageSettingsScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [language, setLanguage] = useState<Language>("en");

  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setLanguage(resolveLanguage(data.settings.language));
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () => getApiClient().updateMe({ language }),
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
      <ScreenHeader kicker={t("settings.title")} title={t("settings.sections.languages")} />

      <View style={styles.segmented}>
        {/* Each name in its own language, so it reads whatever the
            interface is currently in. */}
        {LANGUAGES.map((code) => (
          <Pressable
            key={code}
            style={[styles.segment, language === code && styles.segmentActive]}
            onPress={() => setLanguage(code)}
            accessibilityRole="button"
            accessibilityState={{ selected: language === code }}
          >
            <Text style={[styles.segmentText, language === code && styles.segmentTextActive]}>
              {LANGUAGE_NAMES[code]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{t("settings.languages.hint")}</Text>

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
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
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
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
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
