import type { Challenge } from "@lp/contracts";
import { formatPostDate, outcomeLabel } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { UserAvatar } from "@/lib/social";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { Tag } from "@/lib/ui/primitives";

/**
 * Challenges on the Exam Hub -- the mobile side of
 * apps/web/src/app/(app)/exams/challenges.tsx: send a finished exam to
 * someone who follows you back, answer the ones sent to you, and compare once
 * both of you have finished. Same query key, so the tab badge and the list
 * read one request.
 */

export const CHALLENGES_KEY = ["challenges"];

export function useChallenges() {
  return useQuery({
    queryKey: CHALLENGES_KEY,
    queryFn: () => getApiClient().listChallenges(),
  });
}

/** How many challenges are waiting for your answer -- the Exam Hub badge. */
export function usePendingChallengeCount(): number {
  const challenges = useChallenges();
  return (
    challenges.data?.filter((c) => c.direction === "incoming" && c.status === "pending").length ?? 0
  );
}

function errorMessage(error: unknown): string {
  const body = (error as { body?: { message?: string } } | null)?.body;
  return body?.message ?? (error as Error).message;
}

function SmallButton({
  label,
  accessibilityLabel,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, primary ? styles.buttonPrimary : styles.buttonSecondary]}
    >
      <Text style={primary ? styles.buttonPrimaryText : styles.buttonSecondaryText}>{label}</Text>
    </Pressable>
  );
}

/** "Challenge someone" under a finished exam: lists the people you follow who
 * follow you back, and sends this exam to the one you pick. */
export function ChallengeSender({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const following = useQuery({
    queryKey: ["following"],
    queryFn: () => getApiClient().listFollowing(),
    enabled: open,
  });
  const send = useMutation({
    mutationFn: (userId: string) =>
      getApiClient().createChallenge({ session_id: sessionId, user_id: userId }),
    onSuccess: (challenge) => {
      setSentTo((ids) => [...ids, challenge.opponent.id]);
      void queryClient.invalidateQueries({ queryKey: CHALLENGES_KEY });
    },
  });

  if (!open) {
    return (
      <SmallButton label={t("social.challenges.challengeSomeone")} onPress={() => setOpen(true)} />
    );
  }

  const mutuals = following.data?.filter((user) => user.follows_you) ?? [];
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("social.challenges.challengeSomeone")}</Text>
      <Text style={styles.hint}>{t("social.challenges.pickerHint")}</Text>
      {following.isPending && <Text style={styles.hint}>{t("common.loading")}</Text>}
      {following.data && mutuals.length === 0 && (
        <Pressable accessibilityRole="link" onPress={() => router.push("/profile/people")}>
          <Text style={styles.hint}>
            {t("social.challenges.noMutuals")}{" "}
            <Text style={styles.link}>{t("social.findPeople")}</Text>
          </Text>
        </Pressable>
      )}
      {send.isError && (
        <Text style={styles.error}>
          {t("social.actionFailed", { message: errorMessage(send.error) })}
        </Text>
      )}
      {mutuals.map((user) => {
        const name = user.display_name ?? t("profile.unnamed");
        return (
          <View key={user.id} style={styles.row}>
            <UserAvatar url={user.avatar_url} name={user.display_name} size="sm" />
            <Text style={styles.rowName} numberOfLines={1}>
              {name}
            </Text>
            {sentTo.includes(user.id) ? (
              <Text style={styles.sent} accessibilityLiveRegion="polite">
                {t("social.challenges.sentTo", { name })}
              </Text>
            ) : (
              <SmallButton
                primary
                label={t("social.challenges.challengeSomeone")}
                accessibilityLabel={t("social.challenges.challengeName", { name })}
                disabled={send.isPending}
                onPress={() => send.mutate(user.id)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ChallengeRow({
  challenge,
  onAccepted,
  onOpen,
}: {
  challenge: Challenge;
  onAccepted: () => void;
  onOpen: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const name = challenge.opponent.display_name ?? t("profile.unnamed");
  const refresh = () => queryClient.invalidateQueries({ queryKey: CHALLENGES_KEY });
  const accept = useMutation({
    mutationFn: () => getApiClient().acceptChallenge(challenge.id),
    onSuccess: () => {
      void refresh();
      onAccepted();
    },
  });
  const decline = useMutation({
    mutationFn: () => getApiClient().declineChallenge(challenge.id),
    onSuccess: () => void refresh(),
  });
  const waitingForYou = challenge.direction === "incoming" && challenge.status === "pending";
  const busy = accept.isPending || decline.isPending;

  return (
    <View style={styles.challenge}>
      <View style={styles.row}>
        <UserAvatar
          url={challenge.opponent.avatar_url}
          name={challenge.opponent.display_name}
          size="sm"
        />
        <View style={styles.challengeText}>
          <Text style={styles.body}>
            {challenge.direction === "incoming"
              ? t("social.challenges.incoming", { name, count: challenge.question_count })
              : t("social.challenges.outgoing", { name, count: challenge.question_count })}
          </Text>
          <Text style={styles.hint}>
            {challenge.status === "pending"
              ? t("social.challenges.expires", {
                  date: formatPostDate(challenge.expires_at, language),
                })
              : formatPostDate(challenge.created_at, language)}
          </Text>
        </View>
        {!waitingForYou && challenge.status !== "completed" && (
          <Tag active={challenge.status === "accepted"}>
            {t(`social.challenges.statuses.${challenge.status}`)}
          </Tag>
        )}
      </View>
      {(accept.isError || decline.isError) && (
        <Text style={styles.error}>
          {t("social.actionFailed", { message: errorMessage(accept.error ?? decline.error) })}
        </Text>
      )}
      {waitingForYou && (
        <View style={styles.actions}>
          <SmallButton
            label={t("social.challenges.decline")}
            accessibilityLabel={t("social.challenges.declineName", { name })}
            disabled={busy}
            onPress={() => decline.mutate()}
          />
          <SmallButton
            primary
            label={t("social.challenges.accept")}
            accessibilityLabel={t("social.challenges.acceptName", { name })}
            disabled={busy}
            onPress={() => accept.mutate()}
          />
        </View>
      )}
      {challenge.status === "completed" && (
        <View style={styles.actions}>
          <SmallButton
            label={t("social.challenges.seeResult")}
            onPress={() => onOpen(challenge.id)}
          />
        </View>
      )}
    </View>
  );
}

/** Challenges you've sent and received, newest first. Hidden until there is one. */
export function ChallengesSection({
  onAccepted,
  onOpen,
}: {
  onAccepted: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const challenges = useChallenges();
  if (!challenges.data || challenges.data.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("social.challenges.title")}</Text>
      {challenges.data.map((challenge) => (
        <ChallengeRow
          key={challenge.id}
          challenge={challenge}
          onAccepted={onAccepted}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

function percentText(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}

/** You against them, side by side: both scores and who got each question right. */
export function ChallengeResult({
  challengeId,
  onDone,
}: {
  challengeId: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const challenge = useQuery({
    queryKey: ["challenge", challengeId],
    queryFn: () => getApiClient().getChallenge(challengeId),
  });

  if (challenge.isPending) return <Text style={styles.hint}>{t("common.loading")}</Text>;
  if (challenge.isError) {
    return (
      <Text style={styles.error}>
        {t("social.loadFailed", { message: errorMessage(challenge.error) })}
      </Text>
    );
  }

  const data = challenge.data;
  const name = data.opponent.display_name ?? t("profile.unnamed");
  const mine = data.your_score_percent ?? 0;
  const theirs = data.opponent_score_percent ?? 0;
  const verdict =
    mine > theirs
      ? t("social.challenges.youWon")
      : mine < theirs
        ? t("social.challenges.theyWon", { name })
        : t("social.challenges.tie");
  const outcome = (value: string | null) =>
    value ? outcomeLabel(t, value) : t("social.challenges.unanswered");

  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        {t("social.challenges.resultTitle", { name })}
      </Text>
      <Text style={styles.verdict}>{verdict}</Text>
      <View style={styles.scores}>
        <View style={styles.scoreTile}>
          <Text style={styles.sectionTitle}>{t("social.challenges.you")}</Text>
          <Text style={styles.score}>{percentText(data.your_score_percent)}</Text>
        </View>
        <View style={styles.scoreTile}>
          <Text style={styles.sectionTitle}>{name}</Text>
          <Text style={styles.score}>{percentText(data.opponent_score_percent)}</Text>
        </View>
      </View>
      {data.questions?.map((question) => (
        <View key={question.position} style={styles.questionRow}>
          <Text style={styles.questionLabel}>
            {t("social.challenges.question", { number: question.position + 1 })}
          </Text>
          <Text style={styles.body}>
            {t("social.challenges.you")}: {outcome(question.your_outcome)} · {name}:{" "}
            {outcome(question.opponent_outcome)}
          </Text>
        </View>
      ))}
      <SmallButton primary label={t("social.challenges.back")} onPress={onDone} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  verdict: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  body: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  link: {
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
  sent: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.success,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
  challenge: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  challengeText: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  button: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignSelf: "flex-start",
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonSecondary: {
    borderColor: colors.border,
  },
  buttonPrimaryText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.primaryForeground,
  },
  buttonSecondaryText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
  scores: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  scoreTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
  },
  score: {
    fontSize: fontSizes["2xl"],
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  questionRow: {
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  questionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.mutedForeground,
  },
}));
