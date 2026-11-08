import { Text, View } from "react-native";

import { useI18n } from "@/lib/i18n";
import { fontSizes, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

export default function BillingSettingsScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  return (
    <View style={styles.container}>
      <ScreenHeader kicker={t("settings.title")} title={t("settings.sections.billing")} />
      <Text style={styles.hint}>{t("common.comingSoon")}</Text>
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
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
}));
