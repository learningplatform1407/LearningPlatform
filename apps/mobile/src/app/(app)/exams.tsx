import type {
  QuizOptionResult,
  QuizQuestionResult,
  QuizSession,
  QuizSessionQuestion,
} from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import { ExpandableRow } from "@/lib/expandable-row";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    const body = err.body as { message?: string } | null;
    return body?.message ?? `Request failed with status ${err.status}`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
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
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getApiClient().getQuestionBankTree(),
  });

  const everything = isEverything(topics);
  const selectedCount =
    topics.chapterIds.length + topics.subChapterIds.length + topics.documentIds.length;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Topics</Text>
      <View style={styles.topicsHeaderRow}>
        <Pressable
          style={[styles.pillButton, everything && styles.pillButtonActive]}
          onPress={() => onChange(EMPTY_TOPICS)}
          accessibilityRole="button"
        >
          <Text style={[styles.pillButtonText, everything && styles.pillButtonTextActive]}>
            All topics
          </Text>
        </Pressable>
        {!everything && <Text style={styles.hint}>{selectedCount} selected</Text>}
      </View>

      {tree.isPending && <Text style={styles.hint}>Loading topics...</Text>}
      {tree.data && (
        <View style={styles.list}>
          {tree.data.books.map((book) => (
            <ExpandableRow key={book.id} title={book.title}>
              {book.chapters.length === 0 ? (
                <Text style={styles.hint}>No chapters.</Text>
              ) : (
                <View style={styles.list}>
                  {book.chapters.map((chapter) => (
                    <ExpandableRow
                      key={chapter.id}
                      title={chapter.title}
                      badge={
                        <CheckboxRow
                          label="whole chapter"
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
                                label="all"
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
    onSuccess: onStarted,
    onError: (err) => setError(describeError(err)),
  });

  return (
    <View style={styles.form}>
      <TopicPicker topics={topics} onChange={setTopics} />

      <View style={styles.field}>
        <Text style={styles.label}>Tags — none selected means no tag filter</Text>
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
        {tagIds.length > 1 && (
          <Text style={styles.hint}>
            Tags narrow the pool — a question must carry every tag you select.
          </Text>
        )}
        {availableCount !== undefined && (
          <Text style={styles.hint}>
            {availableCount === 0
              ? "No published questions match this filter."
              : `${availableCount} question${availableCount === 1 ? "" : "s"} available` +
                (parsedCount > availableCount ? ` — you'll get all ${availableCount}` : "")}
          </Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Number of questions</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={questionCount}
          onChangeText={setQuestionCount}
        />
      </View>

      <Pressable
        style={styles.switchRow}
        onPress={() => setTimed((value) => !value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: timed }}
      >
        <Text style={styles.label}>Timed</Text>
        <Switch value={timed} onValueChange={setTimed} />
      </Pressable>
      {timed && (
        <View style={styles.field}>
          <Text style={styles.label}>Duration (minutes)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={durationMinutes}
            onChangeText={setDurationMinutes}
          />
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Reveal mode</Text>
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, revealMode === "immediate" && styles.segmentActive]}
            onPress={() => setRevealMode("immediate")}
            accessibilityRole="button"
          >
            <Text
              style={[styles.segmentText, revealMode === "immediate" && styles.segmentTextActive]}
            >
              Immediate
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
              On finish
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {revealMode === "immediate"
            ? "See the answer after each question."
            : "See results only at the end."}
        </Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[
          styles.button,
          styles.buttonPrimary,
          (start.isPending || availableCount === 0) && styles.buttonDisabled,
        ]}
        onPress={() => start.mutate()}
        disabled={start.isPending || availableCount === 0}
        accessibilityRole="button"
      >
        {start.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Start quiz</Text>
        )}
      </Pressable>
    </View>
  );
}

// --- runner --------------------------------------------------------------

function OptionResultRow({ option }: { option: QuizOptionResult }) {
  const color = option.classified_correctly
    ? colors.success
    : option.selected
      ? colors.danger
      : colors.mutedForeground;
  return (
    <View style={styles.optionResultRow}>
      <Text style={{ color }}>{option.selected ? "☑" : "☐"}</Text>
      <View style={styles.optionResultText}>
        <Text style={styles.optionText}>
          {option.text}
          {option.in_key && <Text style={styles.hint}> (correct answer)</Text>}
        </Text>
        {option.rationale && <Text style={styles.rationale}>{option.rationale}</Text>}
      </View>
    </View>
  );
}

function ImmediateReveal({ result }: { result: QuizQuestionResult }) {
  return (
    <View style={styles.reveal}>
      <Text style={styles.revealTitle}>
        {result.outcome} — {result.points_awarded}/{result.points_possible} points
      </Text>
      <View style={styles.optionResultList}>
        {result.options.map((option) => (
          <OptionResultRow key={option.id} option={option} />
        ))}
      </View>
      {result.explanation && <Text style={styles.rationale}>{result.explanation}</Text>}
    </View>
  );
}

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
  const [selected, setSelected] = useState<string[]>(question.selected_option_ids ?? []);
  const answered = question.answered_at !== null || reveal !== undefined;
  // Under `immediate` an answer is final server-side. `reveal` only covers
  // answers given in this screen's lifetime, so after a reload it's empty
  // while the question is still locked -- without `answered` here the Save
  // button stays live and every press is a guaranteed already_answered 409.
  const locked = revealMode === "immediate" && answered;

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
      <View style={styles.optionList}>
        {question.options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={styles.optionRow}
              onPress={() => toggle(option.id)}
              disabled={disabled || locked}
              accessibilityRole={question.kind === "single" ? "radio" : "checkbox"}
              accessibilityState={{ checked, disabled: disabled || locked }}
            >
              <Text style={styles.optionMark}>
                {question.kind === "single" ? (checked ? "●" : "○") : checked ? "☑" : "☐"}
              </Text>
              <Text style={styles.optionText}>{option.text}</Text>
            </Pressable>
          );
        })}
      </View>
      {reveal ? (
        <ImmediateReveal result={reveal} />
      ) : locked ? (
        // Answered in an earlier visit: the session payload carries the
        // points and outcome under `immediate`, but not the per-option
        // rationales -- those only come back from the answer call itself
        // and from /results once the quiz is over.
        <Text style={styles.hint}>
          Answered — {question.outcome} ({question.points_awarded}/{question.points_possible}{" "}
          points)
        </Text>
      ) : (
        <Pressable
          style={[styles.button, (disabled || selected.length === 0) && styles.buttonDisabled]}
          disabled={disabled || selected.length === 0}
          onPress={() => onAnswer(question.position, selected)}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{answered ? "Answer saved ✓" : "Save answer"}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Runner({ session, onFinished }: { session: QuizSession; onFinished: () => void }) {
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

  useEffect(() => {
    const total = session.remaining_seconds;
    if (total === null || session.status !== "active") return;

    const startedAtMs = Date.parse(session.server_time);
    const id = setInterval(() => {
      const burned = Math.floor((Date.now() - startedAtMs) / 1000);
      setElapsed(burned);
      if (total - burned <= 0) {
        clearInterval(id);
        queryClient.invalidateQueries({ queryKey: ["quiz-session-current"] });
        queryClient.invalidateQueries({ queryKey: ["quiz-session-history"] });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [session.remaining_seconds, session.status, session.server_time, queryClient]);

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
    onSuccess: (result, variables) => {
      if ("outcome" in result) {
        setReveals((prev) => ({ ...prev, [variables.position]: result }));
      }
      refetchSession();
    },
    onError: (err) => setError(describeError(err)),
  });

  const pause = useMutation({
    mutationFn: () => api.pauseQuizSession(session.id),
    onSuccess: refetchSession,
    onError: (err) => setError(describeError(err)),
  });

  const resume = useMutation({
    mutationFn: () => api.resumeQuizSession(session.id),
    onSuccess: refetchSession,
    onError: (err) => setError(describeError(err)),
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelQuizSession(session.id),
    onSuccess: onFinished,
    onError: (err) => setError(describeError(err)),
  });

  const submit = useMutation({
    mutationFn: () => api.submitQuizSession(session.id),
    onSuccess: onFinished,
    onError: (err) => setError(describeError(err)),
  });

  const isPaused = session.status === "paused";

  function confirmCancel() {
    Alert.alert("Cancel this attempt?", "It cannot be resumed.", [
      { text: "Keep going", style: "cancel" },
      { text: "Cancel attempt", style: "destructive", onPress: () => cancel.mutate() },
    ]);
  }

  return (
    <View style={styles.form}>
      <View style={styles.timerRow}>
        <Text style={styles.timerText}>
          {remaining !== null ? formatSeconds(remaining) : "Untimed"}
          {isPaused && " (paused)"} · {session.reveal_mode}
        </Text>
        <View style={styles.timerActions}>
          {isPaused ? (
            <Pressable
              style={styles.button}
              onPress={() => resume.mutate()}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Resume</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.button}
              onPress={() => pause.mutate()}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Pause</Text>
            </Pressable>
          )}
          <Pressable style={styles.button} onPress={confirmCancel} accessibilityRole="button">
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {isPaused ? (
        <Text style={styles.hint}>Paused — resume to see the questions again.</Text>
      ) : (
        <View style={styles.list}>
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
      )}

      {/* Submitting while paused is a real transition (paused -> completed),
          and forcing a resume first would restart the clock on a timed quiz
          the user has already decided they're done with. */}
      <Pressable
        style={[styles.button, styles.buttonPrimary, submit.isPending && styles.buttonDisabled]}
        onPress={() => submit.mutate()}
        disabled={submit.isPending}
        accessibilityRole="button"
      >
        {submit.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Submit quiz</Text>
        )}
      </Pressable>
    </View>
  );
}

// --- results ---------------------------------------------------------------

function Results({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const api = getApiClient();
  const results = useQuery({
    queryKey: ["quiz-results", sessionId],
    queryFn: () => api.getQuizResults(sessionId),
  });

  if (results.isPending) {
    return <Text style={styles.hint}>Loading results...</Text>;
  }
  if (results.isError) {
    return <Text style={styles.error}>{describeError(results.error)}</Text>;
  }

  const data = results.data;
  return (
    <View style={styles.form}>
      <Text style={styles.resultsTitle}>
        {data.status === "cancelled"
          ? "Attempt cancelled"
          : `${data.points_awarded ?? 0} / ${data.points_possible ?? 0} points`}
      </Text>
      {data.questions.map((question) => (
        <View key={question.position} style={styles.card}>
          <Text style={styles.prompt}>
            {question.position + 1}. {question.prompt} — {question.outcome} (
            {question.points_awarded}/{question.points_possible})
          </Text>
          <View style={styles.optionResultList}>
            {question.options.map((option) => (
              <OptionResultRow key={option.id} option={option} />
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
        <Text style={styles.buttonPrimaryText}>Back to quizzes</Text>
      </Pressable>
    </View>
  );
}

// --- history -----------------------------------------------------------------

function History({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const api = getApiClient();
  const history = useQuery({
    queryKey: ["quiz-session-history"],
    queryFn: () => api.listQuizSessionHistory(),
  });

  if (!history.data || history.data.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Recent attempts</Text>
      <View style={styles.list}>
        {history.data.map((item) => (
          <Pressable
            key={item.id}
            style={styles.historyRow}
            onPress={() => onOpen(item.id)}
            accessibilityRole="button"
          >
            <Text style={styles.optionText}>
              {item.status} · {item.points_awarded ?? "—"}/{item.points_possible ?? "—"} points ·{" "}
              {item.question_count} questions
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// --- screen ----------------------------------------------------------------

export default function ExamsScreen() {
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Exam Hub</Text>
      <Text style={styles.hint}>
        Build a custom quiz from any topics and tags. Scheduled mock exams will appear here too.
      </Text>

      {viewingResultsFor ? (
        <Results
          sessionId={viewingResultsFor}
          onDone={() => {
            setViewingResultsFor(null);
            refreshCurrent();
          }}
        />
      ) : current.isPending ? (
        <Text style={styles.hint}>Loading...</Text>
      ) : current.data ? (
        <Runner
          session={current.data}
          onFinished={() => {
            setViewingResultsFor(current.data!.id);
            refreshCurrent();
          }}
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
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
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
    borderRadius: 8,
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
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.sm,
  },
  prompt: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  optionList: {
    gap: spacing.xs,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  optionMark: {
    fontSize: fontSizes.base,
    color: colors.foreground,
    width: 20,
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
    borderRadius: 8,
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
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  historyRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
});
