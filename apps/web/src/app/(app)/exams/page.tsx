"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  QuizOptionResult,
  QuizQuestionResult,
  QuizSession,
  QuizSessionQuestion,
} from "@lp/api-client";
import { ApiClientError } from "@lp/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/button";
import { ExpandableRow } from "@/components/expandable-row";
import { getBrowserApiClient } from "@/lib/api-client.browser";

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
  const tree = useQuery({
    queryKey: ["question-bank-tree"],
    queryFn: () => getBrowserApiClient().getQuestionBankTree(),
  });

  const everything = isEverything(topics);

  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="text-sm text-foreground">Topics</legend>
      <div className="mt-xs flex items-center gap-sm">
        <Button
          type="button"
          variant={everything ? "primary" : "secondary"}
          onClick={() => onChange(EMPTY_TOPICS)}
        >
          All topics
        </Button>
        {!everything && (
          <span className="text-xs text-muted-foreground">
            {topics.chapterIds.length + topics.subChapterIds.length + topics.documentIds.length}{" "}
            selected
          </span>
        )}
      </div>

      {tree.isPending && <p className="text-xs text-muted-foreground">Loading topics...</p>}
      {tree.data && (
        <ul className="mt-xs flex flex-col gap-xs">
          {tree.data.books.map((book) => (
            <ExpandableRow key={book.id} title={book.title}>
              {book.chapters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chapters.</p>
              ) : (
                <ul className="flex flex-col gap-xs">
                  {book.chapters.map((chapter) => (
                    <ExpandableRow
                      key={chapter.id}
                      title={chapter.title}
                      badge={
                        <label className="flex items-center gap-xs text-xs text-muted-foreground">
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
                          whole chapter
                        </label>
                      }
                    >
                      <ul className="flex flex-col gap-xs">
                        {chapter.sub_chapters.map((subChapter) => (
                          <ExpandableRow
                            key={subChapter.id}
                            title={subChapter.title}
                            badge={
                              <label className="flex items-center gap-xs text-xs text-muted-foreground">
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
                                all
                              </label>
                            }
                          >
                            <ul className="flex flex-col gap-xs">
                              {subChapter.lessons.map((lesson) => (
                                <li key={lesson.id}>
                                  <label className="flex items-center gap-xs text-sm text-foreground">
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

function StartForm({ onStarted }: { onStarted: () => void }) {
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
    onSuccess: onStarted,
    onError: (err) => setError(describeError(err)),
  });

  // Bracket widths, not max-w-md/2xl — our --spacing-* tokens shadow
  // Tailwind's container scale, so the named keys collapse to a few pixels.
  // See components/auth-layout.tsx.
  return (
    <div className="mt-lg flex w-full max-w-[32rem] flex-col gap-md">
      <TopicPicker topics={topics} onChange={setTopics} />

      <fieldset className="flex flex-col gap-xs">
        <legend className="text-sm text-foreground">
          Tags — none selected means no tag filter
        </legend>
        <div className="mt-xs flex flex-wrap gap-sm">
          {(tags.data ?? []).map((tag) => (
            <label
              key={tag.id}
              className="flex items-center gap-xs rounded-md border border-border px-sm py-xs text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={tagIds.includes(tag.id)}
                onChange={() => toggleTag(tag.id)}
              />
              {tag.label} ({tag.question_count})
            </label>
          ))}
        </div>
        {tagIds.length > 1 && (
          <span className="text-xs text-muted-foreground">
            Tags narrow the pool — a question must carry every tag you select.
          </span>
        )}
        {availableCount !== undefined && (
          <span className="text-xs text-muted-foreground">
            {availableCount === 0
              ? "No published questions match this filter."
              : `${availableCount} question${availableCount === 1 ? "" : "s"} available` +
                (questionCount > availableCount ? ` — you'll get all ${availableCount}` : "")}
          </span>
        )}
      </fieldset>

      <label className="flex flex-col gap-xs text-sm text-foreground">
        Number of questions
        <input
          type="number"
          min={1}
          max={100}
          value={questionCount}
          onChange={(event) => setQuestionCount(Number(event.target.value))}
          className="rounded-md border border-border px-sm py-xs text-sm"
        />
      </label>

      <label className="flex items-center gap-xs text-sm text-foreground">
        <input
          type="checkbox"
          checked={timed}
          onChange={(event) => setTimed(event.target.checked)}
        />
        Timed
      </label>
      {timed && (
        <label className="flex flex-col gap-xs text-sm text-foreground">
          Duration (minutes)
          <input
            type="number"
            min={1}
            max={240}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className="rounded-md border border-border px-sm py-xs text-sm"
          />
        </label>
      )}

      <label className="flex flex-col gap-xs text-sm text-foreground">
        Reveal mode
        <select
          value={revealMode}
          onChange={(event) => setRevealMode(event.target.value as "immediate" | "on_finish")}
          className="rounded-md border border-border px-sm py-xs text-sm"
        >
          <option value="immediate">Immediate — see the answer after each question</option>
          <option value="on_finish">On finish — see results only at the end</option>
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
        disabled={start.isPending || availableCount === 0}
      >
        {start.isPending ? "Starting..." : "Start quiz"}
      </Button>
    </div>
  );
}

// --- runner --------------------------------------------------------------

function OptionResultRow({ option }: { option: QuizOptionResult }) {
  return (
    <li className="flex items-start gap-sm text-sm">
      <span
        className={
          option.classified_correctly
            ? "text-success"
            : option.selected
              ? "text-danger"
              : "text-muted-foreground"
        }
      >
        {option.selected ? "☑" : "☐"}
      </span>
      <span className="flex-1">
        {option.text}
        {option.in_key && (
          <span className="ml-xs text-xs text-muted-foreground">(correct answer)</span>
        )}
        {option.rationale && (
          <span className="block text-xs text-muted-foreground">{option.rationale}</span>
        )}
      </span>
    </li>
  );
}

function ImmediateReveal({ result }: { result: QuizQuestionResult }) {
  return (
    <div className="mt-sm rounded-md border border-border bg-secondary/40 p-sm">
      <p className="text-sm font-medium text-foreground">
        {result.outcome} — {result.points_awarded}/{result.points_possible} points
      </p>
      <ul className="mt-xs flex flex-col gap-xs">
        {result.options.map((option) => (
          <OptionResultRow key={option.id} option={option} />
        ))}
      </ul>
      {result.explanation && (
        <p className="mt-xs text-xs text-muted-foreground">{result.explanation}</p>
      )}
    </div>
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
  // answers given in this page's lifetime, so after a reload it is empty
  // while the question is still locked — without `answered` here the Save
  // button stays live and every click is a guaranteed already_answered 409.
  const locked = revealMode === "immediate" && answered;

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
    <div className="rounded-md border border-border p-md">
      <p className="text-sm font-medium text-foreground">
        {question.position + 1}. {question.prompt}
      </p>
      <ul className="mt-sm flex flex-col gap-xs">
        {question.options.map((option) => (
          <li key={option.id}>
            <label className="flex items-center gap-xs text-sm text-foreground">
              <input
                type={question.kind === "single" ? "radio" : "checkbox"}
                name={`question-${question.position}`}
                checked={selected.includes(option.id)}
                disabled={disabled || locked}
                onChange={() => toggle(option.id)}
              />
              {option.text}
            </label>
          </li>
        ))}
      </ul>
      {reveal ? (
        <ImmediateReveal result={reveal} />
      ) : locked ? (
        // Answered in an earlier visit: the session payload carries the
        // points and outcome under `immediate`, but not the per-option
        // rationales — those only come back from the answer call itself
        // and from /results once the quiz is over.
        <p className="mt-sm text-sm text-muted-foreground">
          Answered — {question.outcome} ({question.points_awarded}/{question.points_possible}{" "}
          points)
        </p>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="mt-sm"
          disabled={disabled || selected.length === 0}
          onClick={() => onAnswer(question.position, selected)}
        >
          {answered ? "Answer saved ✓" : "Save answer"}
        </Button>
      )}
    </div>
  );
}

function Runner({ session, onFinished }: { session: QuizSession; onFinished: () => void }) {
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

  // Only an ACTIVE session's clock is running. While paused the server has
  // banked the elapsed time, so remaining_seconds is already the frozen
  // answer — ticking on top of it counts down time the user is not being
  // charged for, and the display then jumps back up on resume.
  useEffect(() => {
    const total = session.remaining_seconds;
    if (total === null || session.status !== "active") return;

    const startedAtMs = Date.parse(session.server_time);
    const id = setInterval(() => {
      // Wall clock, not a tick count, so a throttled background tab catches
      // up instead of drifting slow. Reading it here is fine — the purity
      // rule only forbids it during render.
      const burned = Math.floor((Date.now() - startedAtMs) / 1000);
      setElapsed(burned);
      if (total - burned <= 0) {
        // Hit zero: stop ticking and re-read, which is the touch that makes
        // the server finalise it (lazy expiry). Without this the runner sits
        // at 0:00 and every further click just errors.
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

  return (
    <div className="mt-lg flex w-full max-w-[48rem] flex-col gap-md">
      <div className="flex items-center justify-between rounded-md border border-border p-sm">
        <span className="text-sm font-medium text-foreground">
          {remaining !== null ? formatSeconds(remaining) : "Untimed"}
          {isPaused && " (paused)"} · {session.reveal_mode}
        </span>
        <div className="flex gap-xs">
          {isPaused ? (
            <Button type="button" variant="secondary" onClick={() => resume.mutate()}>
              Resume
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => pause.mutate()}>
              Pause
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (confirm("Cancel this attempt? It cannot be resumed.")) cancel.mutate();
            }}
          >
            Cancel
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {isPaused ? (
        <p className="text-sm text-muted-foreground">Paused — resume to see the questions again.</p>
      ) : (
        <div className="flex flex-col gap-md">
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
      )}

      {/* Submitting while paused is a real transition (paused --> completed),
          and forcing a resume first would restart the clock on a timed quiz
          the user has already decided they are done with. */}
      <Button type="button" onClick={() => submit.mutate()} disabled={submit.isPending}>
        {submit.isPending ? "Submitting..." : "Submit quiz"}
      </Button>
    </div>
  );
}

// --- results ---------------------------------------------------------------

function Results({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const api = getBrowserApiClient();
  const results = useQuery({
    queryKey: ["quiz-results", sessionId],
    queryFn: () => api.getQuizResults(sessionId),
  });

  if (results.isPending) {
    return <p className="mt-lg text-sm text-muted-foreground">Loading results...</p>;
  }
  if (results.isError) {
    return <p className="mt-lg text-sm text-danger">{describeError(results.error)}</p>;
  }

  const data = results.data;
  return (
    <div className="mt-lg flex w-full max-w-[48rem] flex-col gap-md">
      <h2 className="text-lg font-semibold text-foreground">
        {data.status === "cancelled"
          ? "Attempt cancelled"
          : `${data.points_awarded ?? 0} / ${data.points_possible ?? 0} points`}
      </h2>
      {data.questions.map((question) => (
        <div key={question.position} className="rounded-md border border-border p-md">
          <p className="text-sm font-medium text-foreground">
            {question.position + 1}. {question.prompt} — {question.outcome} (
            {question.points_awarded}/{question.points_possible})
          </p>
          <ul className="mt-sm flex flex-col gap-xs">
            {question.options.map((option) => (
              <OptionResultRow key={option.id} option={option} />
            ))}
          </ul>
          {question.explanation && (
            <p className="mt-xs text-xs text-muted-foreground">{question.explanation}</p>
          )}
        </div>
      ))}
      <Button type="button" onClick={onDone}>
        Back to quizzes
      </Button>
    </div>
  );
}

// --- history -----------------------------------------------------------------

function History({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const api = getBrowserApiClient();
  const history = useQuery({
    queryKey: ["quiz-session-history"],
    queryFn: () => api.listQuizSessionHistory(),
  });

  if (!history.data || history.data.length === 0) return null;

  return (
    <div className="mt-xl w-full max-w-[48rem]">
      <h2 className="text-sm font-medium text-foreground">Recent attempts</h2>
      <ul className="mt-sm flex flex-col gap-xs">
        {history.data.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="w-full rounded-md border border-border p-sm text-left text-sm hover:bg-secondary/40"
            >
              {item.status} · {item.points_awarded ?? "—"}/{item.points_possible ?? "—"} points ·{" "}
              {item.question_count} questions
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- page ----------------------------------------------------------------

export default function QuizzesPage() {
  const api = getBrowserApiClient();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.getMe() });
  const isAdmin = me.data?.role === "admin";

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
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Exam Hub</h1>
      <p className="mt-xs text-sm text-muted-foreground">
        Build a custom quiz from any topics and tags. Scheduled mock exams will appear here too.
      </p>

      {viewingResultsFor ? (
        <Results
          sessionId={viewingResultsFor}
          onDone={() => {
            setViewingResultsFor(null);
            refreshCurrent();
          }}
        />
      ) : current.isPending ? (
        <p className="mt-lg text-sm text-muted-foreground">Loading...</p>
      ) : current.data ? (
        (() => {
          const session = current.data;
          return (
            <Runner
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
          <StartForm onStarted={refreshCurrent} />
          <History onOpen={setViewingResultsFor} />
        </>
      )}

      {isAdmin && (
        <Link
          href="/question-bank/manage"
          className="mt-lg inline-block text-sm text-primary hover:underline"
        >
          Import questions →
        </Link>
      )}
    </main>
  );
}
