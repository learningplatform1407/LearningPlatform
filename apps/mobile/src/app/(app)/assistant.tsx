import { Text, View } from "react-native";

import { fontSizes, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";
import { useI18n } from "@/lib/i18n";

export default function AssistantScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <ScreenHeader kicker={t("common.comingSoonKicker")} title={t("nav.assistant")} />
      <Text style={styles.subtitle}>{t("common.comingSoon")}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
}));
