import { Text, View } from "react-native";

import { fontSizes, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

export default function PrivacySettingsScreen() {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <ScreenHeader kicker="Settings" title="Privacy" />
      <Text style={styles.hint}>Nothing to configure yet.</Text>
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
