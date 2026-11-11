"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuizQuestionResult, QuizSession, QuizSessionQuestion } from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import {
  attemptPercent,
  formatPostDate,
  MAX_FILTER_TAGS,
  outcomeLabel,
  quizStatusLabel,
  revealModeLabel,
  summarizePastExams,
  type Translator,
} from "@lp/ui";
import { useEffect, useEffectEvent, useState } from "react";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Tag } from "@/components/chip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExpandableRow } from "@/components/expandable-row";
import { ProgressBar } from "@/components/progress-bar";
import { StatTile } from "@/components/stat-tile";
import { OptionChoice, QuestionRevealPanel } from "@/components/question-reveal";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

import { ChallengeResult, ChallengeSender, ChallengesSection } from "./challenges";

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

// The server's bounds (services/api/app/quizzes/constants.py), checked here
// so an empty or out-of-range field greys the button out instead of failing.
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 100;
const MIN_MINUTES = 1;
const MAX_MINUTES = 240;

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

/**
 * Nested topic picker. Checking a chapter selects it whole — the server
 * expands it to every lesson beneath it — while a lesson can be picked on its
 * own. Selected topics OR together.
 *
 * "Everything" is the empty selection rather than every box ticked: ticking
 * every node resolves to every *lesson*, which silently excludes questions
 * attached to no lesson at all. Clearing means no topic filter, which really
 * is everything.
 */
function TopicPicker({
  topics,
  onChange,
}: {
  topics: TopicSelection;
  onChange: (next: TopicSelection) => void;
}) {
  const { t } = useI18n();
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getBrowserApiClient().getQuestionBankTree(),
  });

  const everything = isEverything(topics);

  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="text-toc font-semibold text-foreground">{t("exams.topics")}</legend>
      <div className="mt-xs flex items-center gap-sm">
        <Button
          type="button"
          variant={everything ? "primary" : "secondary"}
          onClick={() => onChange(EMPTY_TOPICS)}
        >
          {t("exams.allTopics")}
        </Button>
        {!everything && (
          <span className="text-xs text-muted-foreground">
            {t("exams.selected", {
              count:
                topics.chapterIds.length + topics.subChapterIds.length + topics.documentIds.length,
            })}
          </span>
        )}
      </div>

      {tree.isPending && (
        <p className="text-xs text-muted-foreground">{t("exams.loadingTopics")}</p>
      )}
      {tree.data && (
        <ul className="mt-xs border-y border-border">
          {tree.data.books.map((book) => (
            <ExpandableRow key={book.id} title={book.title}>
              {book.chapters.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bank.noChapters")}</p>
              ) : (
                <ul>
                  {book.chapters.map((chapter) => (
                    <ExpandableRow
                      key={chapter.id}
                      title={chapter.title}
                      badge={
                        <label className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={topics.chapterIds.includes(chapter.id)}
                            onChange={() =>
                              onChange({
                                ...topics,
                                chapterIds: toggleIn(topics.chapterIds, chapter.id),
                              })
                            }
                          />
                          {t("exams.wholeChapter")}
                        </label>
                      }
                    >
                      <ul>
                        {chapter.sub_chapters.map((subChapter) => (
                          <ExpandableRow
                            key={subChapter.id}
                            title={subChapter.title}
                            badge={
                              <label className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={topics.subChapterIds.includes(subChapter.id)}
                                  onChange={() =>
                                    onChange({
                                      ...topics,
                                      subChapterIds: toggleIn(topics.subChapterIds, subChapter.id),
                                    })
                                  }
                                />
                                {t("exams.all")}
                              </label>
                            }
                          >
                            <ul>
                              {subChapter.lessons.map((lesson) => (
                                <li key={lesson.id}>
                                  <label className="flex items-center gap-sm py-1 text-toc font-semibold text-foreground">
                                    <input
                                      type="checkbox"
                                      checked={topics.documentIds.includes(lesson.id)}
                                      onChange={() =>
                                        onChange({
                                          ...topics,
                                          documentIds: toggleIn(topics.documentIds, lesson.id),
                                        })
                                      }
                                    />
                                    {lesson.title} ({lesson.question_count})
                                  </label>
                                </li>
                              ))}
                            </ul>
                          </ExpandableRow>
                        ))}
                      </ul>
                    </ExpandableRow>
                  ))}
                </ul>
              )}
            </ExpandableRow>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

type TagOption = { id: string; label: string; question_count: number };

/**
 * A searchable checkbox dropdown for tags, replacing what used to be a flat
 * row of checkbox pills -- fine for a handful of tags, unworkable once a
 * course has dozens. No existing dropdown/combobox component exists
 * anywhere in this app to build on, so this is self-contained: a transparent
 * full-viewport backdrop to close on outside click (the same idiom the
 * Sidebar's mobile drawer and the lesson reader's TOC/Notes drawers already
 * use), plus a local Escape handler. Not `useDismissableOverlay` -- that
 * hook also locks body scroll, which is more than an inline dropdown needs.
 */
function TagPicker({
  tags,
  selectedIds,
  onToggle,
}: {
  tags: TagOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const filtered = tags.filter((tag) => tag.label.toLowerCase().includes(search.toLowerCase()));
  const atLimit = selectedIds.length >= MAX_FILTER_TAGS;

  return (
    <div className="relative">
      <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
        {selectedIds.length === 0
          ? t("exams.tags")
          : t("exams.tagsSelected", { count: selectedIds.length })}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-0" onClick={() => setOpen(false)} />
          <div className="absolute z-10 mt-xs w-80 rounded-xl border border-border bg-background shadow-notch">
            <div className="border-b border-border p-sm">
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("exams.searchTags")}
                className="field text-sm!"
              />
            </div>
            {/* The server rejects more than MAX_FILTER_TAGS with a 400, which
                nothing used to mention until it happened. At the cap, further
                boxes are disabled and the limit is stated; already-selected
                ones stay operable so the picker is never a dead end. */}
            {atLimit && (
              <p className="px-sm pb-xs text-sm text-muted-foreground">
                {t("exams.tagLimitReached", { max: MAX_FILTER_TAGS })}
              </p>
            )}
            <div className="flex max-h-64 flex-col gap-xs overflow-y-auto p-sm">
              {filtered.length === 0 ? (
                <p className="px-sm py-xs text-sm text-muted-foreground">
                  {t("exams.noMatchingTags")}
                </p>
              ) : (
                filtered.map((tag) => {
                  const isSelected = selectedIds.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      className="flex items-center gap-sm rounded-sm px-sm py-1.5 text-toc font-semibold text-foreground hover:bg-muted has-disabled:opacity-50"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isSelected && atLimit}
                        onChange={() => onToggle(tag.id)}
                      />
                      {tag.label} ({tag.question_count})
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StartForm({ onStarted }: { onStarted: () => void }) {
  const { t } = useI18n();
  const api = getBrowserApiClient();
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.listTags() });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [timed, setTimed] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [revealMode, setRevealMode] = useState<"immediate" | "on_finish">("immediate");
  const [error, setError] = useState<string | null>(null);

  const [topics, setTopics] = useState<TopicSelection>(EMPTY_TOPICS);

  const filter = {
    chapterIds: topics.chapterIds,
    subChapterIds: topics.subChapterIds,
    documentIds: topics.documentIds,
    tagIds,
  };
  // The only honest feedback that an AND tag filter has narrowed to nothing,
  // and that the per-tag counts beside each checkbox overlap.
  const available = useQuery({
    queryKey: ["quiz-available-count", filter],
    queryFn: () => api.getQuizAvailableCount(filter),
  });
  const availableCount = available.data?.available;
  const countInvalid = !(questionCount >= MIN_QUESTIONS && questionCount <= MAX_QUESTIONS);
  const durationInvalid =
    timed && !(durationMinutes >= MIN_MINUTES && durationMinutes <= MAX_MINUTES);

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
        question_count: questionCount,
        duration_seconds: timed ? durationMinutes * 60 : null,
        reveal_mode: revealMode,
      }),
    onMutate: () => setError(null),
    onSuccess: onStarted,
    onError: (err) => setError(describeError(t, err)),
  });

  // Bracket widths, not max-w-md/2xl — our --spacing-* tokens shadow
  // Tailwind's container scale, so the named keys collapse to a few pixels.
  // See components/auth-layout.tsx. 48rem matches the Runner/Results/History
  // sections below and Question Bank's own width, so Exam Hub isn't the one
  // narrower page in its own state machine.
  return (
    <div className="mt-lg flex w-full flex-col gap-md">
      <TopicPicker topics={topics} onChange={setTopics} />

      <fieldset className="flex flex-col gap-xs">
        <legend className="text-toc font-semibold text-foreground">{t("exams.tagsLegend")}</legend>
        <div className="mt-xs">
          <TagPicker tags={tags.data ?? []} selectedIds={tagIds} onToggle={toggleTag} />
        </div>
        {tagIds.length > 1 && (
          <span className="text-xs text-muted-foreground">{t("exams.tagsNarrow")}</span>
        )}
        {availableCount !== undefined && (
          <span className="text-xs text-muted-foreground">
            {availableCount === 0
              ? t("exams.noneAvailable")
              : t("exams.available", { count: availableCount }) +
                (questionCount > availableCount
                  ? t("exams.youGetAll", { count: availableCount })
                  : "")}
          </span>
        )}
      </fieldset>

      <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
        {t("exams.questionCount")}
        <input
          type="number"
          min={1}
          max={100}
          value={questionCount}
          onChange={(event) => setQuestionCount(Number(event.target.value))}
          className="field w-auto"
        />
        {countInvalid && (
          <span className="text-xs font-normal text-danger">
            {t("exams.questionRange", { min: MIN_QUESTIONS, max: MAX_QUESTIONS })}
          </span>
        )}
      </label>

      <label className="flex items-center gap-sm py-1 text-toc font-semibold text-foreground">
        <input
          type="checkbox"
          checked={timed}
          onChange={(event) => setTimed(event.target.checked)}
        />
        {t("exams.timed")}
      </label>
      {timed && (
        <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
          {t("exams.duration")}
          <input
            type="number"
            min={1}
            max={240}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className="field w-auto"
          />
          {durationInvalid && (
            <span className="text-xs font-normal text-danger">
              {t("exams.minuteRange", { min: MIN_MINUTES, max: MAX_MINUTES })}
            </span>
          )}
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
        {t("exams.revealMode")}
        <select
          value={revealMode}
          onChange={(event) => setRevealMode(event.target.value as "immediate" | "on_finish")}
          className="field w-auto"
        >
          <option value="immediate">{t("exams.immediateOption")}</option>
          <option value="on_finish">{t("exams.onFinishOption")}</option>
        </select>
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button
        type="button"
        onClick={() => start.mutate()}
        disabled={start.isPending || availableCount === 0 || countInvalid || durationInvalid}
      >
        {start.isPending ? t("exams.starting") : t("exams.start")}
      </Button>
    </div>
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
  const [selected, setSelected] = useState<string[]>(question.selected_option_ids ?? []);
  const answered = question.answered_at !== null || reveal !== undefined;
  // Under `immediate` an answer is final server-side. `reveal` only covers
  // answers given in this page's lifetime, so after a reload it is empty
  // while the question is still locked — without `answered` here the Save
  // button stays live and every click is a guaranteed already_answered 409.
  const locked = revealMode === "immediate" && answered;
  // Under on_finish a saved answer can still be changed; the label says when
  // the ticks on screen are no longer what the server holds.
  const saved = question.selected_option_ids ?? [];
  const changed = saved.length !== selected.length || selected.some((id) => !saved.includes(id));

  function toggle(optionId: string) {
    if (question.kind === "single") {
      setSelected([optionId]);
      return;
    }
    setSelected((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  }

  return (
    <div className="border-t border-border pt-md">
      <p className="mb-2.5 font-bold text-foreground">
        {question.position + 1}. {question.prompt}
      </p>
      {reveal ? (
        <QuestionRevealPanel reveal={reveal} />
      ) : (
        <ul>
          {question.options.map((option, index) => (
            <li key={option.id}>
              <OptionChoice
                name={`question-${question.position}`}
                kind={question.kind}
                index={index}
                text={option.text}
                checked={selected.includes(option.id)}
                disabled={disabled || locked}
                onChange={() => toggle(option.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {reveal ? null : locked ? (
        // Answered in an earlier visit: the session payload carries the
        // points and outcome under `immediate`, but not the per-option
        // rationales — those only come back from the answer call itself
        // and from /results once the quiz is over.
        <p className="mt-sm text-toc font-semibold text-muted-foreground">
          {t("exams.answeredLine", {
            outcome: outcomeLabel(t, question.outcome),
            awarded: question.points_awarded ?? 0,
            possible: question.points_possible ?? 0,
          })}
        </p>
      ) : (
        <Button
          type="button"
          className="mt-sm"
          disabled={disabled || selected.length === 0}
          onClick={() => onAnswer(question.position, selected)}
        >
          {!answered
            ? t("exams.saveAnswer")
            : changed
              ? t("exams.updateAnswer")
              : t("exams.answerSaved")}
        </Button>
      )}
    </div>
  );
}

function Runner({ session, onFinished }: { session: QuizSession; onFinished: () => void }) {
  const { t } = useI18n();
  const api = getBrowserApiClient();
  const queryClient = useQueryClient();
  // Seconds burned since the server snapshot we're rendering. Held as a
  // delta rather than an absolute `now`, and reset below whenever the server
  // sends a new snapshot: the interval is stopped while paused, so an
  // absolute clock would still read pause-time on resume and the first frame
  // would show MORE time than the user has (pause at 29:48, resume at 29:53).
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

  // Only an ACTIVE session's clock is running. While paused the server has
  // banked the elapsed time, so remaining_seconds is already the frozen
  // answer — ticking on top of it counts down time the user is not being
  // charged for, and the display then jumps back up on resume.
  useEffect(() => {
    const total = session.remaining_seconds;
    if (total === null || session.status !== "active") return;

    // Counted from when this snapshot arrived, not from `server_time`: the
    // device clock can be minutes off the server's, and that difference used
    // to come straight off (or on top of) the timer.
    const receivedAtMs = Date.now();
    const id = setInterval(() => {
      // Wall clock, not a tick count, so a throttled background tab catches
      // up instead of drifting slow. Reading it here is fine — the purity
      // rule only forbids it during render.
      const burned = Math.floor((Date.now() - receivedAtMs) / 1000);
      setElapsed(burned);
      // One second past zero: remaining_seconds is rounded down, so at 0:00
      // the server can still be a fraction of a second short of expiring it.
      // Reading the results is the touch that makes it finalise (lazy expiry).
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

  // Which confirmation is open, rather than two booleans: only one question
  // can be on screen at a time, and the dialog derives what it shows from it.
  const [confirming, setConfirming] = useState<"submit" | "cancel" | null>(null);

  function confirmSubmit() {
    // Nothing to warn about when every question has an answer.
    if (unanswered === 0) {
      submit.mutate();
      return;
    }
    setConfirming("submit");
  }

  return (
    <div className="mt-lg flex w-full flex-col gap-md">
      <div className="sticky top-0 z-10 -mx-md flex items-center justify-between gap-sm rounded-b-xl border border-t-0 border-border bg-background px-md py-sm shadow-notch">
        <span className="text-ui font-bold text-foreground tabular-nums">
          {remaining !== null ? formatSeconds(remaining) : t("exams.untimed")}
          {isPaused && t("exams.paused")} · {revealModeLabel(t, session.reveal_mode)}
        </span>
        <div className="flex gap-xs">
          {isPaused ? (
            <Button type="button" variant="secondary" onClick={() => resume.mutate()}>
              {t("exams.resume")}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => pause.mutate()}>
              {t("exams.pause")}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => setConfirming("cancel")}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "cancel" ? t("exams.confirmCancelTitle") : t("exams.submitTitle")}
        message={
          confirming === "cancel"
            ? t("exams.cannotResume")
            : t("exams.unansweredWarning", { count: unanswered })
        }
        confirmLabel={confirming === "cancel" ? t("exams.cancelAttempt") : t("exams.submit")}
        cancelLabel={t("exams.keepGoing")}
        destructive={confirming === "cancel"}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          // Read before clearing: the dialog closes on the same tick, and the
          // mutation to fire depends on which question was asked.
          const kind = confirming;
          setConfirming(null);
          if (kind === "cancel") cancel.mutate();
          else submit.mutate();
        }}
      />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {isPaused && <p className="text-sm text-muted-foreground">{t("exams.pausedHint")}</p>}
      {/* Hidden, not unmounted, while paused: ticks not saved yet (on_finish)
          would otherwise be lost. The server still refuses answers then. */}
      <div className="flex flex-col gap-lg" hidden={isPaused}>
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
      </div>

      {/* Submitting while paused is a real transition (paused --> completed),
          and forcing a resume first would restart the clock on a timed quiz
          the user has already decided they are done with. */}
      <Button type="button" onClick={confirmSubmit} disabled={submit.isPending}>
        {submit.isPending ? t("exams.submitting") : t("exams.submitQuiz")}
      </Button>
    </div>
  );
}

// --- results ---------------------------------------------------------------

function Results({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { t } = useI18n();
  const api = getBrowserApiClient();
  const results = useQuery({
    queryKey: ["quiz-results", sessionId],
    queryFn: () => api.getQuizResults(sessionId),
  });

  if (results.isPending) {
    return <p className="mt-lg text-sm text-muted-foreground">{t("exams.loadingResults")}</p>;
  }
  if (results.isError) {
    return <p className="mt-lg text-sm text-danger">{describeError(t, results.error)}</p>;
  }

  const data = results.data;
  return (
    <div className="mt-lg flex w-full flex-col gap-md">
      <h2 className="text-heading font-extrabold text-foreground">
        {data.status === "cancelled"
          ? t("exams.attemptCancelled")
          : t("exams.score", {
              awarded: data.points_awarded ?? 0,
              possible: data.points_possible ?? 0,
            })}
      </h2>
      {data.questions.map((question) => (
        <div key={question.position} className="border-t border-border pt-md">
          <p className="mb-2.5 font-bold text-foreground">
            {question.position + 1}. {question.prompt}
          </p>
          <QuestionRevealPanel reveal={question} />
        </div>
      ))}
      {data.status !== "cancelled" && <ChallengeSender sessionId={sessionId} />}
      <Button type="button" onClick={onDone}>
        {t("exams.backToQuizzes")}
      </Button>
    </div>
  );
}

// --- history -----------------------------------------------------------------

/** Past exams: three summary tiles over a card per attempt.
 *
 * This replaced a ruled list whose every row was one interpolated sentence
 * ("completed · 18/24 points · 20 questions"). Three things were wrong with
 * that: a score is a proportion, and as prose it has to be worked out; the
 * payload's `created_at` was never shown at all, so attempts could not be
 * told apart; and the section was dense text on a screen already heavy with
 * it. Nothing new is fetched -- the date and every number here were already
 * in `listQuizSessionHistory()`.
 */
function History({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const { t, language } = useI18n();
  const api = getBrowserApiClient();
  const history = useQuery({
    queryKey: ["quiz-session-history"],
    queryFn: () => api.listQuizSessionHistory(),
  });

  if (!history.data || history.data.length === 0) return null;

  const summary = summarizePastExams(history.data);

  return (
    <section className="mt-xl">
      <h2 className="label-caps">{t("exams.pastExams")}</h2>

      <div className="mt-sm grid grid-cols-3 gap-sm">
        <StatTile label={t("exams.statTaken")} value={String(summary.taken)} />
        <StatTile
          label={t("exams.statAverage")}
          value={summary.averagePercent === null ? "—" : `${summary.averagePercent}%`}
        />
        <StatTile
          label={t("exams.statBest")}
          value={summary.bestPercent === null ? "—" : `${summary.bestPercent}%`}
          emphasis
        />
      </div>

      <ul className="mt-md flex flex-col gap-sm">
        {history.data.map((item) => {
          const percent = attemptPercent(item);
          return (
            <li key={item.id}>
              <Card
                as="button"
                interactive
                onClick={() => onOpen(item.id)}
                className="w-full p-md text-left"
              >
                <div className="flex items-baseline justify-between gap-sm">
                  <span className="text-sm text-muted-foreground">
                    {formatPostDate(item.created_at, language)}
                  </span>
                  <Tag active={item.status === "completed"}>{quizStatusLabel(t, item.status)}</Tag>
                </div>
                <div className="mt-xs flex items-baseline justify-between gap-sm">
                  <span className="text-toc font-bold text-foreground tabular-nums">
                    {percent === null
                      ? t("exams.notScored")
                      : t("exams.scoreFraction", {
                          awarded: item.points_awarded ?? 0,
                          possible: item.points_possible ?? 0,
                        })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("questions.count", { count: item.question_count })}
                  </span>
                </div>
                {/* Renders nothing when the attempt never scored -- that is
                    ProgressBar's own contract for a null percent. */}
                <ProgressBar
                  percent={percent}
                  label={percent === null ? undefined : `${percent}%`}
                />
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- page ----------------------------------------------------------------

export default function QuizzesPage() {
  const { t } = useI18n();
  const api = getBrowserApiClient();
  const queryClient = useQueryClient();

  const current = useQuery({
    queryKey: ["quiz-session-current"],
    queryFn: () => api.getCurrentQuizSession(),
  });

  const [viewingResultsFor, setViewingResultsFor] = useState<string | null>(null);
  const [viewingChallenge, setViewingChallenge] = useState<string | null>(null);

  function refreshCurrent() {
    queryClient.invalidateQueries({ queryKey: ["quiz-session-current"] });
    queryClient.invalidateQueries({ queryKey: ["quiz-session-history"] });
    // Finishing an exam can complete a challenge.
    queryClient.invalidateQueries({ queryKey: ["challenges"] });
  }

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("exams.kicker")} title={t("exams.title")} />
      <p className="text-toc text-muted-foreground">{t("exams.intro")}</p>

      {viewingChallenge ? (
        <ChallengeResult challengeId={viewingChallenge} onDone={() => setViewingChallenge(null)} />
      ) : viewingResultsFor ? (
        <Results
          sessionId={viewingResultsFor}
          onDone={() => {
            setViewingResultsFor(null);
            refreshCurrent();
          }}
        />
      ) : current.isPending ? (
        <p className="mt-lg text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : current.data ? (
        (() => {
          const session = current.data;
          return (
            <Runner
              key={session.id}
              session={session}
              onFinished={() => {
                setViewingResultsFor(session.id);
                refreshCurrent();
              }}
            />
          );
        })()
      ) : (
        <>
          <ChallengesSection onAccepted={refreshCurrent} onOpen={setViewingChallenge} />
          <StartForm onStarted={refreshCurrent} />
          <History onOpen={setViewingResultsFor} />
        </>
      )}
    </PageMain>
  );
}
