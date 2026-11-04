import { Text, View } from "react-native";

import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

export default function RoadmapScreen() {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Roadmap</Text>
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
  title: {
    fontSize: fontSizes["2xl"],
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
}));
