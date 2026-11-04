import { Text, View } from "react-native";

import { fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

export default function BillingSettingsScreen() {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Subscription & Billing</Text>
      <Text style={styles.hint}>Coming soon.</Text>
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
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
}));
