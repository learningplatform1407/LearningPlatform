import { StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

export default function QuestionBankScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Question Bank</Text>
      <Text style={styles.subtitle}>
        Browsing and answering questions is on the web for now. This screen exists so the tab and
        the Learn hub link have somewhere to land.
      </Text>
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
