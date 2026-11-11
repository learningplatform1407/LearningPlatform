import type { ActivityEvent } from "@lp/contracts";
import { formatPostDate } from "@lp/ui";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { rich, useI18n } from "@/lib/i18n";
import { UserAvatar } from "@/lib/social";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

/** One feed line: who, what, when -- the mobile side of
 * apps/web/src/components/activity-list.tsx. The name and the lesson are
 * nested pressable <Text>s inside the sentence, so they wrap with it. */
function ActivityItem({ event }: { event: ActivityEvent }) {
  const { t, language } = useI18n();
  const styles = useStyles();
  const name = (
    <Text
      style={styles.name}
      accessibilityRole="link"
      onPress={() => router.push(`/profile/${event.user.id}`)}
    >
      {event.user.display_name ?? t("profile.unnamed")}
    </Text>
  );

  let sentence: React.ReactNode;
  if (event.kind === "lesson_completed" && event.document_id) {
    const documentId = event.document_id;
    sentence = rich(t("social.activity.lessonCompleted"), {
      name,
      lesson: (
        <Text
          style={styles.lesson}
          accessibilityRole="link"
          onPress={() => router.push(`/learn/${documentId}`)}
        >
          {event.document_title}
        </Text>
      ),
    });
  } else if (event.kind === "exam_completed") {
    sentence = rich(
      event.score_percent === null
        ? t("social.activity.examFinished")
        : t("social.activity.examCompleted", { score: event.score_percent }),
      { name },
    );
  } else {
    sentence = rich(t("social.activity.streak", { count: event.streak_days ?? 0 }), { name });
  }

  return (
    <View style={styles.item}>
      <UserAvatar url={event.user.avatar_url} name={event.user.display_name} size="sm" />
      <View style={styles.body}>
        <Text style={styles.sentence}>{sentence}</Text>
        <Text style={styles.date}>{formatPostDate(event.created_at, language)}</Text>
      </View>
    </View>
  );
}

export function ActivityList({ events }: { events: ActivityEvent[] }) {
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {events.map((event) => (
        <ActivityItem key={event.id} event={event} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  list: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  body: {
    flex: 1,
  },
  sentence: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  name: {
    fontWeight: fontWeights.bold,
  },
  lesson: {
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  date: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
}));
