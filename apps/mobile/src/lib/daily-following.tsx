import { outcomeLabel } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { UserAvatar } from "@/lib/social";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { Tag } from "@/lib/ui/primitives";

/** Under today's revealed answer: how the people you follow did -- the mobile
 * side of apps/web/src/components/daily-following.tsx. Nothing at all while
 * none of them has answered. */
export function DailyFollowing() {
  const { t } = useI18n();
  const styles = useStyles();
  const following = useQuery({
    queryKey: ["daily-question", "following"],
    queryFn: () => getApiClient().getDailyFollowing(),
  });
  const data = following.data;
  if (!data || data.answered_count === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("social.daily.title")}</Text>
        <Text style={styles.summary}>
          {t("social.daily.summary", { correct: data.correct_count, count: data.answered_count })}
        </Text>
      </View>
      {data.answers.map(({ user, outcome }) => (
        <View key={user.id} style={styles.row}>
          <UserAvatar url={user.avatar_url} name={user.display_name} size="sm" />
          <Pressable
            style={styles.nameButton}
            accessibilityRole="link"
            onPress={() => router.push(`/profile/${user.id}`)}
          >
            <Text style={styles.name} numberOfLines={1}>
              {user.display_name ?? t("profile.unnamed")}
            </Text>
          </Pressable>
          <Tag active={outcome === "correct"}>{outcomeLabel(t, outcome)}</Tag>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  summary: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.mutedForeground,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nameButton: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
}));
