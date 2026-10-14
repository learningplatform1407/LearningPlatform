import type { DailyQuestion } from "@lp/api-client";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { DailyQuestionCard } from "@/lib/daily-question-card";
import { DailyQuestionOverlay, useDailyQuestion } from "@/lib/daily-question-overlay";
import { colors, fontSizes, fontWeights, lineHeight, radii, shadows, spacing } from "@/lib/theme";

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

/** The hub's own content: recent lessons and the nav grid.
 *
 * Its query lives here rather than in the screen so the loading and error
 * branches can keep their early returns while the sheet stays mounted above
 * them -- otherwise the question of the day could not offer itself until an
 * unrelated lessons query had resolved. Same split as the web page.
 */
function LearnContent({
  today,
  onOpenToday,
}: {
  today: DailyQuestion | undefined;
  onOpenToday: () => void;
}) {
  const {
    data: recentLessons,
    isPending,
    isError,
  } = useQuery({
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
          style={({ pressed }) => [styles.continueCard, pressed && styles.cardPressed]}
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
          style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
          onPress={() => router.push("/learn/library")}
          accessibilityRole="button"
        >
          <Text style={styles.navCardTitle}>Library</Text>
          <Text style={styles.navCardSubtitle}>Browse books, chapters, and lessons.</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
          onPress={() => router.push("/learn/review")}
          accessibilityRole="button"
        >
          <Text style={styles.navCardTitle}>Review</Text>
          <Text style={styles.navCardSubtitle}>
            See how many words are due today, across every lesson.
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
          onPress={() => router.push("/question-bank")}
          accessibilityRole="button"
        >
          <Text style={styles.navCardTitle}>Question Bank</Text>
          <Text style={styles.navCardSubtitle}>
            Browse and answer questions, with stats on your progress.
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
          onPress={() => router.push("/learn/flashcards")}
          accessibilityRole="button"
        >
          <Text style={styles.navCardTitle}>Flashcards</Text>
          <Text style={styles.navCardSubtitle}>
            Spaced-repetition cards per lesson, official and your own.
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
          onPress={() => router.push("/learn/notebook")}
          accessibilityRole="button"
        >
          <Text style={styles.navCardTitle}>Notebook</Text>
          <Text style={styles.navCardSubtitle}>All your notes and drawings in one place.</Text>
        </Pressable>
        {today && <DailyQuestionCard today={today} onOpen={onOpenToday} />}
      </View>
    </ScrollView>
  );
}

export default function LearnScreen() {
  const { today, openDate, open, holdOpen, close } = useDailyQuestion();
  const day = today.data;

  return (
    <>
      <LearnContent
        today={day}
        onOpenToday={() => {
          if (day) open(day.server_today);
        }}
      />
      {/* One sheet for the card and the calendar inside it, mounted here so
          neither can open its own. */}
      {day && (
        <DailyQuestionOverlay
          forDate={openDate}
          today={day}
          onSelectDay={open}
          onAnswered={holdOpen}
          onClose={close}
        />
      )}
    </>
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
    borderRadius: radii.md,
    backgroundColor: colors.muted,
    padding: spacing.lg,
    ...shadows.sm,
  },
  cardPressed: {
    opacity: 0.85,
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
    flexWrap: "wrap",
    gap: spacing.md,
  },
  navCard: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
    ...shadows.sm,
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
