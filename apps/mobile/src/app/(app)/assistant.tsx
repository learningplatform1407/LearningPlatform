import { StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

export default function AssistantScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Assistant</Text>
      <Text style={styles.subtitle}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
