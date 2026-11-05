import { Text, View } from "react-native";

import { fontSizes, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

export default function RoadmapScreen() {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <ScreenHeader kicker="Coming soon" title="Roadmap" />
      <Text style={styles.subtitle}>Coming soon.</Text>
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
