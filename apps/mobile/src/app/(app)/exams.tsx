import type { QuizQuestionResult, QuizSession, QuizSessionQuestion } from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import { outcomeLabel, quizStatusLabel, revealModeLabel, type Translator } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import { OptionChoice, OptionResultRow, QuestionRevealPanel } from "@/lib/question-reveal";
import { ExpandableRow } from "@/lib/expandable-row";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";
import { useI18n } from "@/lib/i18n";

function describeError(t: Translator["t"], err: unknown): string {
  if (err instanceof ApiClientError) {
    const body = err.body as { message?: string } | null;
    return body?.message ?? t("questions.requestFailed", { status: err.status });
  }
  return err instanceof Error ? err.message : t("admin.import.somethingWrong");
}

function formatSeconds(total: number): string {
  const clamped = Math.max(0, total);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// --- start form --------------------------------------------------------

type TopicSelection = {
  chapterIds: string[];
  subChapterIds: string[];
  documentIds: string[];
};

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 100;
const MIN_MINUTES = 1;
const MAX_MINUTES = 240;

const EMPTY_TOPICS: TopicSelection = { chapterIds: [], subChapterIds: [], documentIds: [] };

function isEverything(topics: TopicSelection): boolean {
  return (
    topics.chapterIds.length === 0 &&
    topics.subChapterIds.length === 0 &&
    topics.documentIds.length === 0
  );
}

function toggleIn(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={styles.checkboxRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <Text style={styles.optionMark}>{checked ? "☑" : "☐"}</Text>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Nested topic picker. Checking a chapter selects it whole — the server
 * expands it to every lesson beneath it — while a lesson can be picked on its
 * own. Selected topics OR together. Mirrors the web TopicPicker in
 * apps/web/src/app/(app)/exams/page.tsx.
 *
 * "Everything" is the empty selection rather than every box ticked — see
 * that file's comment for why ticking every node is not equivalent.
 */
function TopicPicker({
  topics,
  onChange,
}: {
  topics: TopicSelection;
  onChange: (next: TopicSelection) => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });

  const everything = isEverything(topics);
  const selectedCount =
    topics.chapterIds.length + topics.subChapterIds.length + topics.documentIds.length;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{t("exams.topics")}</Text>
      <View style={styles.topicsHeaderRow}>
        <Pressable
          style={[styles.pillButton, everything && styles.pillButtonActive]}
          onPress={() => onChange(EMPTY_TOPICS)}
          accessibilityRole="button"
        >
          <Text style={[styles.pillButtonText, everything && styles.pillButtonTextActive]}>
            {t("exams.allTopics")}
          </Text>
        </Pressable>
        {!everything && (
          <Text style={styles.hint}>{t("exams.selected", { count: selectedCount })}</Text>
        )}
      </View>

      {tree.isPending && <Text style={styles.hint}>{t("exams.loadingTopics")}</Text>}
      {tree.data && (
        <View style={styles.list}>
          {tree.data.books.map((book) => (
            <ExpandableRow key={book.id} title={book.title}>
              {book.chapters.length === 0 ? (
                <Text style={styles.hint}>{t("bank.noChapters")}</Text>
              ) : (
                <View style={styles.list}>
                  {book.chapters.map((chapter) => (
                    <ExpandableRow
                      key={chapter.id}
                      title={chapter.title}
                      badge={
                        <CheckboxRow
                          label={t("exams.wholeChapter")}
                          checked={topics.chapterIds.includes(chapter.id)}
                          onToggle={() =>
                            onChange({
                              ...topics,
                              chapterIds: toggleIn(topics.chapterIds, chapter.id),
                            })
                          }
                        />
                      }
                    >
                      <View style={styles.list}>
                        {chapter.sub_chapters.map((subChapter) => (
                          <ExpandableRow
                            key={subChapter.id}
                            title={subChapter.title}
                            badge={
                              <CheckboxRow
                                label={t("exams.all")}
                                checked={topics.subChapterIds.includes(subChapter.id)}
                                onToggle={() =>
                                  onChange({
                                    ...topics,
                                    subChapterIds: toggleIn(topics.subChapterIds, subChapter.id),
                                  })
                                }
                              />
                            }
                          >
                            <View style={styles.list}>
                              {subChapter.lessons.map((lesson) => (
                                <CheckboxRow
                                  key={lesson.id}
                                  label={`${lesson.title} (${lesson.question_count})`}
                                  checked={topics.documentIds.includes(lesson.id)}
                                  onToggle={() =>
                                    onChange({
                                      ...topics,
                                      documentIds: toggleIn(topics.documentIds, lesson.id),
                                    })
                                  }
                                />
                              ))}
                            </View>
                          </ExpandableRow>
                        ))}
                      </View>
                    </ExpandableRow>
                  ))}
                </View>
              )}
            </ExpandableRow>
          ))}
        </View>
      )}
    </View>
  );
}

function StartForm({ onStarted }: { onStarted: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const api = getApiClient();
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.listTags() });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState("10");
  const [timed, setTimed] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [revealMode, setRevealMode] = useState<"immediate" | "on_finish">("immediate");
  const [error, setError] = useState<string | null>(null);

  const [topics, setTopics] = useState<TopicSelection>(EMPTY_TOPICS);

  const filter = {
    chapterIds: topics.chapterIds,
    subChapterIds: topics.subChapterIds,
    documentIds: topics.documentIds,
    tagIds,
  };
  const available = useQuery({
    queryKey: ["quiz-available-count", filter],
    queryFn: () => api.getQuizAvailableCount(filter),
  });
  const availableCount = available.data?.available;
  const parsedCount = Number.parseInt(questionCount, 10) || 0;
  const parsedDuration = Number.parseInt(durationMinutes, 10) || 0;
  // The server's bounds (services/api/app/quizzes/constants.py), checked
  // here so an empty or 0 field greys the button out instead of failing.
  const countInvalid = parsedCount < MIN_QUESTIONS || parsedCount > MAX_QUESTIONS;
  const durationInvalid = timed && (parsedDuration < MIN_MINUTES || parsedDuration > MAX_MINUTES);

  function toggleTag(id: string) {
    setTagIds((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
  }

  const start = useMutation({
    mutationFn: () =>
      api.startQuizSession({
        chapter_ids: topics.chapterIds,
        sub_chapter_ids: topics.subChapterIds,
        document_ids: topics.documentIds,
        tag_ids: tagIds,
        question_count: parsedCount,
        duration_seconds: timed ? parsedDuration * 60 : null,
        reveal_mode: revealMode,
      }),
    onMutate: () => setError(null),
    onSuccess: onStarted,
    onError: (err) => setError(describeError(t, err)),
  });

  const startDisabled = start.isPending || availableCount === 0 || countInvalid || durationInvalid;

  return (
    <View style={styles.form}>
      <TopicPicker topics={topics} onChange={setTopics} />

      <View style={styles.field}>
        <Text style={styles.label}>{t("exams.tagsLegend")}</Text>
        <View style={styles.tagRow}>
          {(tags.data ?? []).map((tag) => (
            <Pressable
              key={tag.id}
              style={[styles.tagPill, tagIds.includes(tag.id) && styles.tagPillActive]}
              onPress={() => toggleTag(tag.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: tagIds.includes(tag.id) }}
            >
              <Text
                style={[styles.tagPillText, tagIds.includes(tag.id) && styles.tagPillTextActive]}
              >
                {tag.label} ({tag.question_count})
              </Text>
            </Pressable>
          ))}
        </View>
        {tagIds.length > 1 && <Text style={styles.hint}>{t("exams.tagsNarrow")}</Text>}
        {availableCount !== undefined && (
          <Text style={styles.hint}>
            {availableCount === 0
              ? t("exams.noneAvailable")
              : t("exams.available", { count: availableCount }) +
                (parsedCount > availableCount
                  ? t("exams.youGetAll", { count: availableCount })
                  : "")}
          </Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t("exams.questionCount")}</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={questionCount}
          onChangeText={setQuestionCount}
        />
        {countInvalid && (
          <Text style={styles.error}>
            {t("exams.questionRange", { min: MIN_QUESTIONS, max: MAX_QUESTIONS })}
          </Text>
        )}
      </View>

      <Pressable
        style={styles.switchRow}
        onPress={() => setTimed((value) => !value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: timed }}
      >
        <Text style={styles.label}>{t("exams.timed")}</Text>
        <Switch value={timed} onValueChange={setTimed} />
      </Pressable>
      {timed && (
        <View style={styles.field}>
          <Text style={styles.label}>{t("exams.duration")}</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={durationMinutes}
            onChangeText={setDurationMinutes}
          />
          {durationInvalid && (
            <Text style={styles.error}>
              {t("exams.minuteRange", { min: MIN_MINUTES, max: MAX_MINUTES })}
            </Text>
          )}
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>{t("exams.revealMode")}</Text>
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, revealMode === "immediate" && styles.segmentActive]}
            onPress={() => setRevealMode("immediate")}
            accessibilityRole="button"
          >
            <Text
              style={[styles.segmentText, revealMode === "immediate" && styles.segmentTextActive]}
            >
              {t("exams.immediate")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, revealMode === "on_finish" && styles.segmentActive]}
            onPress={() => setRevealMode("on_finish")}
            accessibilityRole="button"
          >
            <Text
              style={[styles.segmentText, revealMode === "on_finish" && styles.segmentTextActive]}
            >
              {t("exams.onFinish")}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {revealMode === "immediate" ? t("exams.immediateHint") : t("exams.onFinishHint")}
        </Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, styles.buttonPrimary, startDisabled && styles.buttonDisabled]}
        onPress={() => start.mutate()}
        disabled={startDisabled}
        accessibilityRole="button"
      >
        {start.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonPrimaryText}>{t("exams.start")}</Text>
        )}
      </Pressable>
    </View>
  );
}

// --- runner --------------------------------------------------------------

function QuestionCard({
  question,
  revealMode,
  disabled,
  onAnswer,
  reveal,
}: {
  question: QuizSessionQuestion;
  revealMode: "immediate" | "on_finish";
  disabled: boolean;
  onAnswer: (position: number, selected: string[]) => void;
  reveal: QuizQuestionResult | undefined;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const [selected, setSelected] = useState<string[]>(question.selected_option_ids ?? []);
  const answered = question.answered_at !== null || reveal !== undefined;
  // Under `immediate` an answer is final server-side. `reveal` only covers
  // answers given in this screen's lifetime, so after a reload it's empty
  // while the question is still locked -- without `answered` here the Save
  // button stays live and every press is a guaranteed already_answered 409.
  const locked = revealMode === "immediate" && answered;
  // Under on_finish a saved answer can still be changed; the label says when
  // the ticks on screen are no longer what the server holds.
  const saved = question.selected_option_ids ?? [];
  const changed = saved.length !== selected.length || selected.some((id) => !saved.includes(id));

  function toggle(optionId: string) {
    if (locked) return;
    if (question.kind === "single") {
      setSelected([optionId]);
      return;
    }
    setSelected((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.prompt}>
        {question.position + 1}. {question.prompt}
      </Text>
      {!reveal && (
        <View style={styles.optionList}>
          {question.options.map((option, index) => (
            <OptionChoice
              key={option.id}
              kind={question.kind}
              index={index}
              text={option.text}
              checked={selected.includes(option.id)}
              disabled={disabled || locked}
              onPress={() => toggle(option.id)}
            />
          ))}
        </View>
      )}
      {reveal ? (
        <QuestionRevealPanel reveal={reveal} />
      ) : locked ? (
        // Answered in an earlier visit: the session payload carries the
        // points and outcome under `immediate`, but not the per-option
        // rationales -- those only come back from the answer call itself
        // and from /results once the quiz is over.
        <Text style={styles.hint}>
          {t("exams.answeredLine", {
            outcome: outcomeLabel(t, question.outcome),
            awarded: question.points_awarded ?? 0,
            possible: question.points_possible ?? 0,
          })}
        </Text>
      ) : (
        <Pressable
          style={[styles.button, (disabled || selected.length === 0) && styles.buttonDisabled]}
          disabled={disabled || selected.length === 0}
          onPress={() => onAnswer(question.position, selected)}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {!answered
              ? t("exams.saveAnswer")
              : changed
                ? t("exams.updateAnswer")
                : t("exams.answerSaved")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function Runner({ session, onFinished }: { session: QuizSession; onFinished: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const api = getApiClient();
  const queryClient = useQueryClient();
  // Seconds burned since the server snapshot we're rendering. Held as a
  // delta rather than an absolute `now`, and reset below whenever the server
  // sends a new snapshot -- see the web Runner's comment in
  // apps/web/src/app/(app)/exams/page.tsx for the pause/resume reasoning.
  const [elapsed, setElapsed] = useState(0);
  const [snapshot, setSnapshot] = useState(session.server_time);
  if (snapshot !== session.server_time) {
    setSnapshot(session.server_time);
    setElapsed(0);
  }
  const [reveals, setReveals] = useState<Record<number, QuizQuestionResult>>({});
  const [error, setError] = useState<string | null>(null);

  // Time ran out: the server has expired the attempt, so show its results
  // rather than dropping back to an empty start form.
  const timeUp = useEffectEvent(() => onFinished());

  useEffect(() => {
    const total = session.remaining_seconds;
    if (total === null || session.status !== "active") return;

    // Counted from when this snapshot arrived on the phone, not from
    // `server_time`: the phone's clock can be minutes off the server's, and
    // that difference used to come straight off (or on top of) the timer.
    const receivedAtMs = Date.now();
    const id = setInterval(() => {
      const burned = Math.floor((Date.now() - receivedAtMs) / 1000);
      setElapsed(burned);
      // One second past zero: remaining_seconds is rounded down, so at 0:00
      // the server can still be a fraction of a second short of expiring it.
      if (total - burned < 0) {
        clearInterval(id);
        timeUp();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [session.remaining_seconds, session.status, session.server_time]);

  const remainingAtFetch = session.remaining_seconds;
  const remaining =
    remainingAtFetch === null
      ? null
      : session.status === "active"
        ? remainingAtFetch - elapsed
        : remainingAtFetch;

  function refetchSession() {
    queryClient.invalidateQueries({ queryKey: ["quiz-session-current"] });
    queryClient.invalidateQueries({ queryKey: ["quiz-session-history"] });
  }

  const answer = useMutation({
    mutationFn: ({ position, selected }: { position: number; selected: string[] }) =>
      api.answerQuizQuestion(session.id, position, selected),
    onMutate: () => setError(null),
    onSuccess: (result, variables) => {
      if ("outcome" in result) {
        setReveals((prev) => ({ ...prev, [variables.position]: result }));
      }
      refetchSession();
    },
    onError: (err) => setError(describeError(t, err)),
  });

  const pause = useMutation({
    mutationFn: () => api.pauseQuizSession(session.id),
    onMutate: () => setError(null),
    onSuccess: refetchSession,
    onError: (err) => setError(describeError(t, err)),
  });

  const resume = useMutation({
    mutationFn: () => api.resumeQuizSession(session.id),
    onMutate: () => setError(null),
    onSuccess: refetchSession,
    onError: (err) => setError(describeError(t, err)),
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelQuizSession(session.id),
    onMutate: () => setError(null),
    onSuccess: onFinished,
    onError: (err) => setError(describeError(t, err)),
  });

  const submit = useMutation({
    mutationFn: () => api.submitQuizSession(session.id),
    onMutate: () => setError(null),
    onSuccess: onFinished,
    onError: (err) => setError(describeError(t, err)),
  });

  const isPaused = session.status === "paused";

  const unanswered = session.questions.filter((question) => question.answered_at === null).length;

  function confirmSubmit() {
    if (unanswered === 0) {
      submit.mutate();
      return;
    }
    Alert.alert(t("exams.submitTitle"), t("exams.unansweredWarning", { count: unanswered }), [
      { text: t("exams.keepGoing"), style: "cancel" },
      { text: t("exams.submit"), onPress: () => submit.mutate() },
    ]);
  }

  function confirmCancel() {
    Alert.alert(t("exams.confirmCancelTitle"), t("exams.cannotResume"), [
      { text: t("exams.keepGoing"), style: "cancel" },
      { text: t("exams.cancelAttempt"), style: "destructive", onPress: () => cancel.mutate() },
    ]);
  }

  return (
    <View style={styles.form}>
      <View style={styles.timerRow}>
        <Text style={styles.timerText}>
          {remaining !== null ? formatSeconds(remaining) : t("exams.untimed")}
          {isPaused && t("exams.paused")} · {revealModeLabel(t, session.reveal_mode)}
        </Text>
        <View style={styles.timerActions}>
          {isPaused ? (
            <Pressable
              style={styles.button}
              onPress={() => resume.mutate()}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{t("exams.resume")}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.button}
              onPress={() => pause.mutate()}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{t("exams.pause")}</Text>
            </Pressable>
          )}
          <Pressable style={styles.button} onPress={confirmCancel} accessibilityRole="button">
            <Text style={styles.buttonText}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {isPaused && <Text style={styles.hint}>{t("exams.pausedHint")}</Text>}
      {/* Hidden, not unmounted, while paused: ticks not saved yet (on_finish)
          would otherwise be lost. The server still refuses answers then. */}
      <View style={[styles.list, isPaused && styles.hidden]}>
        {session.questions.map((question) => (
          <QuestionCard
            key={question.position}
            question={question}
            revealMode={session.reveal_mode}
            disabled={answer.isPending}
            reveal={reveals[question.position]}
            onAnswer={(position, selected) => answer.mutate({ position, selected })}
          />
        ))}
      </View>

      {/* Submitting while paused is a real transition (paused -> completed),
          and forcing a resume first would restart the clock on a timed quiz
          the user has already decided they're done with. */}
      <Pressable
        style={[styles.button, styles.buttonPrimary, submit.isPending && styles.buttonDisabled]}
        onPress={confirmSubmit}
        disabled={submit.isPending}
        accessibilityRole="button"
      >
        {submit.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonPrimaryText}>{t("exams.submitQuiz")}</Text>
        )}
      </Pressable>
    </View>
  );
}

// --- results ---------------------------------------------------------------

function Results({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const api = getApiClient();
  const results = useQuery({
    queryKey: ["quiz-results", sessionId],
    queryFn: () => api.getQuizResults(sessionId),
  });

  if (results.isPending) {
    return <Text style={styles.hint}>{t("exams.loadingResults")}</Text>;
  }
  if (results.isError) {
    return <Text style={styles.error}>{describeError(t, results.error)}</Text>;
  }

  const data = results.data;
  return (
    <View style={styles.form}>
      <Text style={styles.resultsTitle}>
        {data.status === "cancelled"
          ? t("exams.attemptCancelled")
          : t("exams.score", {
              awarded: data.points_awarded ?? 0,
              possible: data.points_possible ?? 0,
            })}
      </Text>
      {data.questions.map((question) => (
        <View key={question.position} style={styles.card}>
          <Text style={styles.prompt}>
            {question.position + 1}. {question.prompt} — {outcomeLabel(t, question.outcome)} (
            {question.points_awarded}/{question.points_possible})
          </Text>
          <View style={styles.optionResultList}>
            {question.options.map((option, index) => (
              <OptionResultRow key={option.id} option={option} index={index} />
            ))}
          </View>
          {question.explanation && <Text style={styles.rationale}>{question.explanation}</Text>}
        </View>
      ))}
      <Pressable
        style={[styles.button, styles.buttonPrimary]}
        onPress={onDone}
        accessibilityRole="button"
      >
        <Text style={styles.buttonPrimaryText}>{t("exams.backToQuizzes")}</Text>
      </Pressable>
    </View>
  );
}

// --- history -----------------------------------------------------------------

function History({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const api = getApiClient();
  const history = useQuery({
    queryKey: ["quiz-session-history"],
    queryFn: () => api.listQuizSessionHistory(),
  });

  if (!history.data || history.data.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{t("exams.recentAttempts")}</Text>
      <View style={styles.list}>
        {history.data.map((item) => (
          <Pressable
            key={item.id}
            style={styles.historyRow}
            onPress={() => onOpen(item.id)}
            accessibilityRole="button"
          >
            <Text style={styles.optionText}>
              {t("exams.historyRow", {
                status: quizStatusLabel(t, item.status),
                awarded: item.points_awarded ?? "—",
                possible: item.points_possible ?? "—",
                questions: t("questions.count", { count: item.question_count }),
              })}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// --- screen ----------------------------------------------------------------

export default function ExamsScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  const api = getApiClient();
  const queryClient = useQueryClient();

  const current = useQuery({
    queryKey: ["quiz-session-current"],
    queryFn: () => api.getCurrentQuizSession(),
  });

  const [viewingResultsFor, setViewingResultsFor] = useState<string | null>(null);

  function refreshCurrent() {
    queryClient.invalidateQueries({ queryKey: ["quiz-session-current"] });
    queryClient.invalidateQueries({ queryKey: ["quiz-session-history"] });
  }

  function attemptEnded(sessionId: string) {
    setViewingResultsFor(sessionId);
    refreshCurrent();
    // The profile's exam numbers (and the streak) count finished attempts.
    queryClient.invalidateQueries({ queryKey: ["me-stats"] });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader kicker={t("exams.kicker")} title={t("exams.title")} />
      <Text style={styles.hint}>{t("exams.intro")}</Text>

      {viewingResultsFor ? (
        <Results
          sessionId={viewingResultsFor}
          onDone={() => {
            setViewingResultsFor(null);
            refreshCurrent();
          }}
        />
      ) : current.isPending ? (
        <Text style={styles.hint}>{t("common.loading")}</Text>
      ) : current.data ? (
        <Runner
          key={current.data.id}
          session={current.data}
          onFinished={() => attemptEnded(current.data!.id)}
        />
      ) : (
        <>
          <StartForm onStarted={refreshCurrent} />
          <History onOpen={setViewingResultsFor} />
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  list: {
    gap: spacing.xs,
  },
  topicsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pillButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  pillButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  pillButtonTextActive: {
    color: colors.primaryForeground,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  checkboxLabel: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tagPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  tagPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tagPillText: {
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  tagPillTextActive: {
    color: colors.primaryForeground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  segmentTextActive: {
    color: colors.primaryForeground,
  },
  button: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  buttonPrimaryText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.primaryForeground,
  },
  card: {
    borderWidth: 0,
    borderRadius: 0,
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 0,
  },
  prompt: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  optionList: {
    gap: spacing.xs,
  },
  // 44pt minimum tap target -- see the same note in daily-question-body.tsx.
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  optionMark: {
    fontSize: fontSizes.xl,
    color: colors.foreground,
    width: 28,
    textAlign: "center",
  },
  optionText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  reveal: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.muted,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  revealTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  optionResultList: {
    gap: spacing.xs,
  },
  optionResultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  optionResultText: {
    flex: 1,
  },
  rationale: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.sm,
  },
  timerText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  timerActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  resultsTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeading: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  historyRow: {
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hidden: {
    display: "none",
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
}));
