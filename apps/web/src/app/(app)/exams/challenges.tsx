"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Challenge } from "@lp/contracts";
import { formatPostDate, outcomeLabel } from "@lp/ui";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { Tag } from "@/components/chip";
import { UserAvatar } from "@/components/user-avatar";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { CHALLENGES_KEY, useChallenges } from "@/lib/challenges";
import { useI18n } from "@/lib/i18n";

/**
 * Challenges on the Exam Hub (docs/architecture/social.md): send a finished
 * exam to someone who follows you back, answer the ones sent to you, and
 * compare once both of you have finished. The questions, their order and the
 * timer are the challenger's own; the API replays them on accept.
 */

function errorMessage(error: unknown): string {
  const body = (error as { body?: { message?: string } } | null)?.body;
  return body?.message ?? (error as Error).message;
}

// --- sending, from an exam's results -----------------------------------------

/** "Challenge someone" under a finished exam: lists the people you follow who
 * follow you back, and sends this exam to the one you pick. */
export function ChallengeSender({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const following = useQuery({
    queryKey: ["following"],
    queryFn: () => getBrowserApiClient().listFollowing(),
    enabled: open,
  });
  const send = useMutation({
    mutationFn: (userId: string) =>
      getBrowserApiClient().createChallenge({ session_id: sessionId, user_id: userId }),
    onSuccess: (challenge) => {
      setSentTo((ids) => [...ids, challenge.opponent.id]);
      void queryClient.invalidateQueries({ queryKey: CHALLENGES_KEY });
    },
  });

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("social.challenges.challengeSomeone")}
      </Button>
    );
  }

  const mutuals = following.data?.filter((user) => user.follows_you) ?? [];
  return (
    <section className="border-t border-border pt-md">
      <h3 className="label-caps m-0">{t("social.challenges.challengeSomeone")}</h3>
      <p className="mt-xs text-caption text-muted-foreground">
        {t("social.challenges.pickerHint")}
      </p>
      {following.isPending && (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
      {following.data && mutuals.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("social.challenges.noMutuals")}{" "}
          <Link href="/profile/people" className="font-bold text-accent hover:underline">
            {t("social.findPeople")}
          </Link>
        </p>
      )}
      {send.isError && (
        <p role="alert" className="text-sm text-danger">
          {t("social.actionFailed", { message: errorMessage(send.error) })}
        </p>
      )}
      <ul className="m-0 mt-sm list-none p-0">
        {mutuals.map((user) => {
          const name = user.display_name ?? t("profile.unnamed");
          const sent = sentTo.includes(user.id);
          return (
            <li key={user.id} className="flex items-center gap-sm border-t border-border py-sm">
              <UserAvatar url={user.avatar_url} name={user.display_name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-ui font-bold text-foreground">
                {name}
              </span>
              {sent ? (
                <span role="status" className="text-caption font-bold text-success">
                  {t("social.challenges.sentTo", { name })}
                </span>
              ) : (
                <Button
                  type="button"
                  aria-label={t("social.challenges.challengeName", { name })}
                  disabled={send.isPending}
                  onClick={() => send.mutate(user.id)}
                >
                  {t("social.challenges.challengeSomeone")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- the list on the Exam Hub ------------------------------------------------

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
  const queryClient = useQueryClient();
  const name = challenge.opponent.display_name ?? t("profile.unnamed");
  const refresh = () => queryClient.invalidateQueries({ queryKey: CHALLENGES_KEY });
  const accept = useMutation({
    mutationFn: () => getBrowserApiClient().acceptChallenge(challenge.id),
    onSuccess: () => {
      void refresh();
      onAccepted();
    },
  });
  const decline = useMutation({
    mutationFn: () => getBrowserApiClient().declineChallenge(challenge.id),
    onSuccess: () => void refresh(),
  });
  const waitingForYou = challenge.direction === "incoming" && challenge.status === "pending";

  return (
    <li className="flex flex-wrap items-center gap-sm border-t border-border py-sm">
      <UserAvatar
        url={challenge.opponent.avatar_url}
        name={challenge.opponent.display_name}
        size="sm"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui text-foreground">
          {challenge.direction === "incoming"
            ? t("social.challenges.incoming", { name, count: challenge.question_count })
            : t("social.challenges.outgoing", { name, count: challenge.question_count })}
        </span>
        <span className="text-caption text-muted-foreground">
          {challenge.status === "pending"
            ? t("social.challenges.expires", {
                date: formatPostDate(challenge.expires_at, language),
              })
            : formatPostDate(challenge.created_at, language)}
        </span>
        {(accept.isError || decline.isError) && (
          <span role="alert" className="text-caption text-danger">
            {t("social.actionFailed", { message: errorMessage(accept.error ?? decline.error) })}
          </span>
        )}
      </div>
      {waitingForYou ? (
        <div className="flex gap-xs">
          <Button
            type="button"
            variant="ghost"
            aria-label={t("social.challenges.declineName", { name })}
            disabled={decline.isPending || accept.isPending}
            onClick={() => decline.mutate()}
          >
            {t("social.challenges.decline")}
          </Button>
          <Button
            type="button"
            aria-label={t("social.challenges.acceptName", { name })}
            disabled={decline.isPending || accept.isPending}
            onClick={() => accept.mutate()}
          >
            {t("social.challenges.accept")}
          </Button>
        </div>
      ) : challenge.status === "completed" ? (
        <Button type="button" variant="secondary" onClick={() => onOpen(challenge.id)}>
          {t("social.challenges.seeResult")}
        </Button>
      ) : (
        <Tag active={challenge.status === "accepted"}>
          {t(`social.challenges.statuses.${challenge.status}`)}
        </Tag>
      )}
    </li>
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
  const challenges = useChallenges();
  if (!challenges.data || challenges.data.length === 0) return null;
  return (
    <section className="mt-lg">
      <h2 className="label-caps m-0 mb-sm">{t("social.challenges.title")}</h2>
      <ul className="m-0 list-none border-b border-border p-0">
        {challenges.data.map((challenge) => (
          <ChallengeRow
            key={challenge.id}
            challenge={challenge}
            onAccepted={onAccepted}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

// --- the comparison ----------------------------------------------------------

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
  const challenge = useQuery({
    queryKey: ["challenge", challengeId],
    queryFn: () => getBrowserApiClient().getChallenge(challengeId),
  });

  if (challenge.isPending) {
    return <p className="mt-lg text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (challenge.isError) {
    return (
      <p role="alert" className="mt-lg text-sm text-danger">
        {t("social.loadFailed", { message: errorMessage(challenge.error) })}
      </p>
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

  return (
    <div className="mt-lg flex w-full flex-col gap-md">
      <h2 className="text-heading m-0 font-extrabold text-foreground">
        {t("social.challenges.resultTitle", { name })}
      </h2>
      <p className="m-0 text-toc font-bold text-foreground">{verdict}</p>
      <div className="grid grid-cols-2 gap-sm">
        <div className="rounded-lg border border-border p-md">
          <p className="label-caps m-0">{t("social.challenges.you")}</p>
          <p className="m-0 text-heading font-extrabold tabular-nums">
            {percentText(data.your_score_percent)}
          </p>
        </div>
        <div className="rounded-lg border border-border p-md">
          <p className="label-caps m-0">{name}</p>
          <p className="m-0 text-heading font-extrabold tabular-nums">
            {percentText(data.opponent_score_percent)}
          </p>
        </div>
      </div>
      {data.questions && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-xs font-bold">#</th>
              <th className="py-xs font-bold">{t("social.challenges.you")}</th>
              <th className="py-xs font-bold">{name}</th>
            </tr>
          </thead>
          <tbody>
            {data.questions.map((question) => (
              <tr key={question.position} className="border-t border-border">
                <td className="py-xs">
                  {t("social.challenges.question", { number: question.position + 1 })}
                </td>
                <td className="py-xs">
                  {question.your_outcome
                    ? outcomeLabel(t, question.your_outcome)
                    : t("social.challenges.unanswered")}
                </td>
                <td className="py-xs">
                  {question.opponent_outcome
                    ? outcomeLabel(t, question.opponent_outcome)
                    : t("social.challenges.unanswered")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button type="button" className="self-start" onClick={onDone}>
        {t("social.challenges.back")}
      </Button>
    </div>
  );
}
