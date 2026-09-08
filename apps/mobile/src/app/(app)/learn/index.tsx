import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

export default function LearnScreen() {
  const { data: recentLessons, isPending, isError } = useQuery({
    queryKey: ["recent-lessons"],
    queryFn: () => getApiClient().listRecentLessons(),
  });

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load your recent lessons.</Text>
      </View>
    );
  }

  const [continueLesson, ...rest] = recentLessons;
  const recentlyOpened = rest.slice(0, 5);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Learn</Text>

      {continueLesson && (
        <Pressable
          style={styles.continueCard}
          onPress={() => router.push(`/learn/${continueLesson.id}`)}
          accessibilityRole="button"
        >
          <Text style={styles.continueLabel}>Continue where you left off</Text>
          <Text style={styles.continueTitle}>{continueLesson.title}</Text>
        </Pressable>
      )}

      {recentlyOpened.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Recently opened</Text>
          <View style={styles.list}>
            {recentlyOpened.map((lesson) => (
              <Pressable
                key={lesson.id}
                style={styles.row}
                onPress={() => router.push(`/learn/${lesson.id}`)}
                accessibilityRole="button"
              >
                <Text style={styles.rowTitle}>{lesson.title}</Text>
                <Text style={styles.rowStatus}>
                  {lesson.status ? (STATUS_LABEL[lesson.status] ?? lesson.status) : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.navGrid}>
        <Pressable
          style={styles.navCard}
          onPress={() => router.push("/learn/lessons")}
          accessibilityRole="button"
        >
          <Text style={styles.navCardTitle}>Lessons</Text>
          <Text style={styles.navCardSubtitle}>Browse chapters and lessons.</Text>
        </Pressable>
        <Pressable
          style={styles.navCard}
          onPress={() => router.push("/learn/flashcards")}
          accessibilityRole="button"
        >
          <Text style={styles.navCardTitle}>Flashcards</Text>
          <Text style={styles.navCardSubtitle}>Coming soon.</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  continueCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.muted,
    padding: spacing.lg,
  },
  continueLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
  },
  continueTitle: {
    marginTop: spacing.xs,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeading: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  rowStatus: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  navGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  navCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.lg,
  },
  navCardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  navCardSubtitle: {
    marginTop: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
});
