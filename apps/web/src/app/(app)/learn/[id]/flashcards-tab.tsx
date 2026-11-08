"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type {
  Flashcard,
  FlashcardCard,
  FlashcardScope,
  FlashcardScopeFilter,
  ReviewRating,
} from "@lp/contracts";

import { BottomNotch } from "@/components/bottom-notch";
import { Button } from "@/components/button";
import { Chip, Tag } from "@/components/chip";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { useI18n } from "@/lib/i18n";

import { GradeButtons, ShowButton, useGradeKeys } from "./grade-bar";

const SCOPE_FILTERS = [
  { key: "all", label: "lesson.flashcards.all" },
  { key: "official", label: "lesson.flashcards.official" },
  { key: "personal", label: "lesson.flashcards.mine" },
] as const;

function ScopeToggle({
  scope,
  onChange,
}: {
  scope: FlashcardScopeFilter;
  onChange: (scope: FlashcardScopeFilter) => void;
}) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t("lesson.flashcards.filter")} className="flex gap-2">
      {SCOPE_FILTERS.map((filter) => (
        <Chip
          key={filter.key}
          aria-pressed={scope === filter.key}
          onClick={() => onChange(filter.key)}
        >
          {t(filter.label)}
        </Chip>
      ))}
    </div>
  );
}

/** Official vs personal, always paired with a word rather than colour alone. */
function ScopeBadge({ scope, onPaper = false }: { scope: FlashcardScope; onPaper?: boolean }) {
  const { t } = useI18n();
  return (
    <Tag className={onPaper ? "border-black/15 text-paper-muted-foreground" : ""}>
      {scope === "official" ? t("lesson.flashcards.official") : t("lesson.flashcards.mine")}
    </Tag>
  );
}

function AddFlashcardForm({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      getBrowserApiClient().createFlashcard(documentId, { front_text: front, back_text: back }),
    onSuccess: () => {
      setFront("");
      setBack("");
      setError(null);
      onDone();
    },
    onError: () => setError(t("lesson.flashcards.saveFailed")),
  });

  return (
    <form
      className="flex w-full flex-col gap-sm border-t border-border pt-md"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
        {t("lesson.flashcards.front")}
        <input value={front} onChange={(event) => setFront(event.target.value)} className="field" />
      </label>
      <label className="flex flex-col gap-xs text-sm font-semibold text-foreground">
        {t("lesson.flashcards.back")}
        <textarea
          value={back}
          onChange={(event) => setBack(event.target.value)}
          rows={3}
          className="field"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-sm">
        <Button type="submit" disabled={!front.trim() || !back.trim() || create.isPending}>
          {t("lesson.flashcards.saveCard")}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function LessonCardRow({ card, onChanged }: { card: Flashcard; onChanged: () => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState(card.front_text);
  const [back, setBack] = useState(card.back_text);
  const [error, setError] = useState<string | null>(null);

  // Reseeds the draft from the card every time the row opens, so Cancel
  // genuinely discards. Without it the state survives the close (the row is
  // keyed by card.id and never remounts) and the next Save would commit an
  // edit the learner had explicitly cancelled.
  function openEditor() {
    setFront(card.front_text);
    setBack(card.back_text);
    setError(null);
    setEditing(true);
  }

  const update = useMutation({
    mutationFn: () =>
      getBrowserApiClient().updateFlashcard(card.id, { front_text: front, back_text: back }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onChanged();
    },
    onError: () => setError(t("lesson.flashcards.saveFailed")),
  });
  const remove = useMutation({
    mutationFn: () => getBrowserApiClient().deleteFlashcard(card.id),
    onSuccess: onChanged,
    onError: () => setError(t("lesson.flashcards.deleteFailed")),
  });
  const suspension = useMutation({
    mutationFn: () => getBrowserApiClient().setFlashcardSuspension(card.id, !card.suspended),
    onSuccess: onChanged,
    // This toggle is the only route back into the rotation, so a silent
    // failure would leave the learner unable to tell the card is still out.
    onError: () =>
      setError(
        card.suspended
          ? t("lesson.flashcards.includeFailed")
          : t("lesson.flashcards.excludeFailed"),
      ),
  });

  if (editing) {
    return (
      <li className="flex flex-col gap-xs border-t border-border py-3">
        <input
          aria-label={t("lesson.flashcards.front")}
          value={front}
          onChange={(event) => setFront(event.target.value)}
          className="field"
        />
        <textarea
          aria-label={t("lesson.flashcards.back")}
          value={back}
          onChange={(event) => setBack(event.target.value)}
          rows={2}
          className="field"
        />
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-xs">
          <Button
            disabled={!front.trim() || !back.trim() || update.isPending}
            onClick={() => update.mutate()}
          >
            {t("common.save")}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-start justify-between gap-sm border-t border-border py-3 ${
        card.suspended ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-ui font-bold text-foreground">{card.front_text}</p>
        <p className="text-sm text-muted-foreground">{card.back_text}</p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-xs">
        <ScopeBadge scope={card.scope} />
        {card.suspended && <Tag>{t("lesson.flashcards.notInRotation")}</Tag>}
        {/* Offered on every visible card, official included — suspension is
            the caller's own review state, not a change to shared content.
            This row is the only place a suspended card is still listed, so
            it is the only way back into the rotation. */}
        <button
          type="button"
          aria-pressed={!card.suspended}
          disabled={suspension.isPending}
          onClick={() => suspension.mutate()}
          className="text-xs font-bold text-accent hover:underline"
        >
          {card.suspended ? t("lesson.flashcards.include") : t("lesson.flashcards.exclude")}
        </button>
        {card.can_edit && (
          <button
            type="button"
            onClick={openEditor}
            className="text-xs font-bold text-accent hover:underline"
          >
            {t("lesson.flashcards.edit")}
          </button>
        )}
        {card.can_delete && (
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="text-xs font-bold text-danger hover:underline"
          >
            {/* Retiring an official card archives it for everyone; deleting
                your own personal card removes it. Different verbs because
                they are different actions. */}
            {card.scope === "official" ? t("lesson.flashcards.retire") : t("common.delete")}
          </button>
        )}
      </div>
    </li>
  );
}

export function FlashcardsTab({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<FlashcardScopeFilter>("all");
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  // Cards removed from the server-driven queue. Every graded card lands
  // here, including "Again" ones — those are re-added to the tail via
  // `againCards` instead.
  const [gradedIds, setGradedIds] = useState<Set<string>>(new Set());
  // "Again" means show me again now. The scheduler's floor is one whole day,
  // so the server will say tomorrow; holding the card locally is what keeps
  // the promise within this session. Kept as card objects rather than ids so
  // a background refetch (which no longer returns them, they are not due)
  // cannot drop them mid-session.
  const [againCards, setAgainCards] = useState<FlashcardCard[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const deckQuery = useQuery({
    queryKey: ["flashcards", "due", documentId, scope],
    queryFn: () => getBrowserApiClient().listDueFlashcards(documentId, { scope }),
  });
  // Every visible card, not just the learner's own: this list is where a
  // suspended card is re-included, and a suspended card is absent from the
  // deck and from every count, so a personal-only list would leave an
  // excluded official card with no way back in.
  const cardsQuery = useQuery({
    queryKey: ["flashcards", "lesson", documentId],
    queryFn: () => getBrowserApiClient().listFlashcards(documentId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["flashcards"] });
  }

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: ReviewRating }) =>
      getBrowserApiClient().submitFlashcardReview(cardId, rating),
    onSuccess: (state, variables) => {
      const { cardId, rating } = variables;
      setGradedIds((previous) => new Set(previous).add(cardId));
      setRevealedCardId(null);
      setActionError(null);

      if (rating === "again") {
        setAgainCards((previous) => {
          const card = [...(deckQuery.data ?? []), ...previous].find((c) => c.id === cardId);
          const withoutIt = previous.filter((c) => c.id !== cardId);
          // Appended, so it comes back after the rest of the queue rather
          // than immediately — re-reading the answer you just saw teaches
          // nothing.
          return card ? [...withoutIt, card] : withoutIt;
        });
        setFeedback(t("lesson.flashcards.seeAgain"));
      } else {
        setAgainCards((previous) => previous.filter((c) => c.id !== cardId));
        setFeedback(t("lesson.flashcards.nextReview", { count: state.interval_days }));
      }
      refresh();
    },
    // Without this a failed grade silently does nothing: the card stays
    // revealed, the buttons re-enable, and the learner has no idea the
    // rating never landed.
    onError: () => setActionError(t("lesson.flashcards.rateFailed")),
  });

  const excludeMutation = useMutation({
    mutationFn: (cardId: string) => getBrowserApiClient().setFlashcardSuspension(cardId, true),
    onSuccess: (_state, cardId) => {
      // Reuses gradedIds: from the runner's point of view an excluded card
      // is simply done with for this session, and the server has already
      // dropped it from the deck.
      setGradedIds((previous) => new Set(previous).add(cardId));
      setAgainCards((previous) => previous.filter((c) => c.id !== cardId));
      setRevealedCardId(null);
      setActionError(null);
      setFeedback(t("lesson.flashcards.excluded"));
      refresh();
    },
    onError: () => setActionError(t("lesson.flashcards.excludeFailed")),
  });

  // Filtered client-side rather than trusting the refetched list to shrink,
  // so a background refetch can't move the card out from under you — same
  // reasoning as ReviewTab above.
  const queue = [
    ...(deckQuery.data ?? []).filter((card) => !gradedIds.has(card.id)),
    ...againCards,
  ];
  const currentCard = queue[0];
  // Cards actually finished: graded and not waiting to come back round.
  const completed = gradedIds.size - againCards.length;
  const revealed = currentCard !== undefined && revealedCardId === currentCard.id;

  function grade(rating: ReviewRating) {
    if (currentCard && revealed && !reviewMutation.isPending) {
      reviewMutation.mutate({ cardId: currentCard.id, rating });
    }
  }

  useGradeKeys(currentCard !== undefined, {
    onShow: () => currentCard && setRevealedCardId(currentCard.id),
    onGrade: grade,
  });

  if (deckQuery.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (deckQuery.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("lesson.flashcards.loadFailed")}
      </p>
    );
  }

  const lessonCards = cardsQuery.data ?? [];
  const excludedCount = lessonCards.filter((card) => card.suspended).length;

  return (
    <div className="flex flex-col items-center gap-md">
      <div className="flex w-full flex-wrap items-center justify-between gap-sm">
        <ScopeToggle
          scope={scope}
          onChange={(next) => {
            // The deck is re-keyed by scope, so the session state derived
            // from it has to go too — otherwise "Card 4 of 5" carries over
            // from the previous scope onto a shorter deck.
            setScope(next);
            setGradedIds(new Set());
            setAgainCards([]);
            setRevealedCardId(null);
            setFeedback(null);
            setActionError(null);
          }}
        />
        {!adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t("lesson.flashcards.addCard")}
          </Button>
        )}
      </div>

      {adding && (
        <AddFlashcardForm
          documentId={documentId}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {!currentCard && (
        <p className="text-sm text-muted-foreground">
          {/* Tests the lesson's cards, not the deck: with every card
              excluded the deck is empty while the lesson is not, and the
              "no flashcards yet" copy would contradict the list below. */}
          {lessonCards.length === 0 && cardsQuery.isSuccess && gradedIds.size === 0
            ? t("lesson.flashcards.none")
            : t("lesson.review.allCaughtUp")}
        </p>
      )}

      {currentCard && (
        <>
          <button
            type="button"
            aria-expanded={revealed}
            onClick={() => setRevealedCardId(currentCard.id)}
            // Paper in both themes, like the review cards (design.md §11).
            className="mt-sm flex min-h-[12rem] w-[min(560px,100%)] flex-col gap-3.5 rounded-sheet bg-paper px-[30px] pt-[30px] pb-lg text-left text-card leading-[1.5] text-paper-foreground shadow-card"
          >
            <span className="flex w-full items-center justify-between gap-2.5 text-xs font-bold tracking-[0.1em] text-paper-muted-foreground uppercase">
              <ScopeBadge scope={currentCard.scope} onPaper />
              <span>
                {t("lesson.flashcards.cardOf", {
                  current: completed + 1,
                  total: completed + queue.length,
                })}
              </span>
            </span>
            <p className="font-bold">{currentCard.front_text}</p>
            {revealed ? (
              <p className="border-t border-black/10 pt-3">{currentCard.back_text}</p>
            ) : (
              <span className="text-sm font-semibold text-paper-muted-foreground">
                {t("lesson.flashcards.tapToReveal")}
              </span>
            )}
          </button>

          <BottomNotch label={t("lesson.flashcards.controls")}>
            {revealed ? (
              <GradeButtons
                onGrade={grade}
                intervals={currentCard.next_intervals}
                disabled={reviewMutation.isPending}
              />
            ) : (
              <ShowButton onShow={() => setRevealedCardId(currentCard.id)} />
            )}
          </BottomNotch>

          {revealed && (
            // Offered at the moment you've just seen the answer and decided
            // you're done with this card, rather than making you hunt for it
            // in the list below.
            <button
              type="button"
              disabled={excludeMutation.isPending}
              onClick={() => excludeMutation.mutate(currentCard.id)}
              className="text-xs font-semibold text-muted-foreground hover:underline"
            >
              {t("lesson.flashcards.excludeThis")}
            </button>
          )}
        </>
      )}

      {feedback && <p className="text-sm font-semibold text-muted-foreground">{feedback}</p>}
      {actionError && (
        <p role="alert" className="text-xs text-danger">
          {actionError}
        </p>
      )}

      {cardsQuery.isError && (
        <p role="alert" className="text-sm text-danger">
          {t("lesson.flashcards.manageFailed")}
        </p>
      )}

      {lessonCards.length > 0 && (
        <section className="mt-lg w-full">
          <h2 className="label-caps mb-sm">
            {t("lesson.flashcards.allCards")}
            {excludedCount > 0 && (
              <span className="ml-xs font-normal text-muted-foreground">
                {t("lesson.flashcards.excludedCount", { count: excludedCount }).trim()}
              </span>
            )}
          </h2>
          <ul className="border-b border-border">
            {lessonCards.map((card) => (
              <LessonCardRow key={card.id} card={card} onChanged={refresh} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
