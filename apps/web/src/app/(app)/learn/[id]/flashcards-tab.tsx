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

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";

const SCOPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "official", label: "Official" },
  { key: "personal", label: "Mine" },
] as const;

function ScopeToggle({
  scope,
  onChange,
}: {
  scope: FlashcardScopeFilter;
  onChange: (scope: FlashcardScopeFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter flashcards" className="flex gap-xs">
      {SCOPE_FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          aria-pressed={scope === filter.key}
          onClick={() => onChange(filter.key)}
          className={`rounded-md border px-sm py-xs text-xs ${
            scope === filter.key
              ? "border-primary bg-muted text-foreground"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

/** Official vs personal, always paired with a word rather than colour alone. */
function ScopeBadge({ scope }: { scope: FlashcardScope }) {
  return (
    <span className="rounded-md border border-border px-xs py-[0.0625rem] text-xs text-muted-foreground">
      {scope === "official" ? "Official" : "Mine"}
    </span>
  );
}

function AddFlashcardForm({ documentId, onDone }: { documentId: string; onDone: () => void }) {
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
    onError: () => setError("Could not save that card."),
  });

  return (
    <form
      className="flex w-full max-w-[32rem] flex-col gap-sm rounded-md border border-border p-md"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <label className="flex flex-col gap-xs text-sm text-foreground">
        Front
        <input
          value={front}
          onChange={(event) => setFront(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-sm py-xs text-sm"
        />
      </label>
      <label className="flex flex-col gap-xs text-sm text-foreground">
        Back
        <textarea
          value={back}
          onChange={(event) => setBack(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-sm py-xs text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-sm">
        <Button type="submit" disabled={!front.trim() || !back.trim() || create.isPending}>
          Save card
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LessonCardRow({ card, onChanged }: { card: Flashcard; onChanged: () => void }) {
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
    onError: () => setError("Could not save that card."),
  });
  const remove = useMutation({
    mutationFn: () => getBrowserApiClient().deleteFlashcard(card.id),
    onSuccess: onChanged,
    onError: () => setError("Could not delete that card."),
  });
  const suspension = useMutation({
    mutationFn: () => getBrowserApiClient().setFlashcardSuspension(card.id, !card.suspended),
    onSuccess: onChanged,
    // This toggle is the only route back into the rotation, so a silent
    // failure would leave the learner unable to tell the card is still out.
    onError: () =>
      setError(card.suspended ? "Could not include that card." : "Could not exclude that card."),
  });

  if (editing) {
    return (
      <li className="flex flex-col gap-xs rounded-md border border-border p-sm">
        <input
          aria-label="Front"
          value={front}
          onChange={(event) => setFront(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-sm py-xs text-sm"
        />
        <textarea
          aria-label="Back"
          value={back}
          onChange={(event) => setBack(event.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-sm py-xs text-sm"
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
            Save
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-start justify-between gap-sm rounded-md border border-border px-md py-sm ${
        card.suspended ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm text-foreground">{card.front_text}</p>
        <p className="text-xs text-muted-foreground">{card.back_text}</p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-xs">
        <ScopeBadge scope={card.scope} />
        {card.suspended && (
          <span className="rounded-md border border-border px-xs py-[0.0625rem] text-xs text-muted-foreground">
            Not in rotation
          </span>
        )}
        {/* Offered on every visible card, official included — suspension is
            the caller's own review state, not a change to shared content.
            This row is the only place a suspended card is still listed, so
            it is the only way back into the rotation. */}
        <button
          type="button"
          aria-pressed={!card.suspended}
          disabled={suspension.isPending}
          onClick={() => suspension.mutate()}
          className="text-xs text-accent hover:underline"
        >
          {card.suspended ? "Include in reviews" : "Exclude from reviews"}
        </button>
        {card.can_edit && (
          <button
            type="button"
            onClick={openEditor}
            className="text-xs text-accent hover:underline"
          >
            Edit
          </button>
        )}
        {card.can_delete && (
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            className="text-xs text-danger hover:underline"
          >
            {/* Retiring an official card archives it for everyone; deleting
                your own personal card removes it. Different verbs because
                they are different actions. */}
            {card.scope === "official" ? "Retire" : "Delete"}
          </button>
        )}
      </div>
    </li>
  );
}

export function FlashcardsTab({ documentId }: { documentId: string }) {
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
        setFeedback("You'll see this one again before you finish.");
      } else {
        setAgainCards((previous) => previous.filter((c) => c.id !== cardId));
        setFeedback(
          `Next review in ${state.interval_days} ${state.interval_days === 1 ? "day" : "days"}.`,
        );
      }
      refresh();
    },
    // Without this a failed grade silently does nothing: the card stays
    // revealed, the buttons re-enable, and the learner has no idea the
    // rating never landed.
    onError: () => setActionError("Could not save that rating."),
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
      setFeedback("Excluded from reviews. You can include it again below.");
      refresh();
    },
    onError: () => setActionError("Could not exclude that card."),
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

  if (deckQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (deckQuery.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load flashcards.
      </p>
    );
  }

  const lessonCards = cardsQuery.data ?? [];
  const excludedCount = lessonCards.filter((card) => card.suspended).length;

  return (
    <div className="flex flex-col items-center gap-md">
      <div className="flex w-full max-w-[32rem] items-center justify-between gap-sm">
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
            Add a card
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
            ? "No flashcards for this lesson yet. Add your own, or check back for official ones."
            : "You're all caught up — nothing to review right now."}
        </p>
      )}

      {currentCard && (
        <>
          <p className="text-xs text-muted-foreground">
            Card {completed + 1} of {completed + queue.length}
          </p>
          <button
            type="button"
            aria-expanded={revealed}
            onClick={() => setRevealedCardId(currentCard.id)}
            className="flex min-h-[10rem] w-full max-w-[32rem] flex-col items-center justify-center gap-sm rounded-md border border-border p-xl text-center hover:bg-muted"
          >
            <ScopeBadge scope={currentCard.scope} />
            <p className="text-lg font-medium text-foreground">{currentCard.front_text}</p>
            {revealed ? (
              <p className="border-t border-border pt-sm text-sm text-foreground">
                {currentCard.back_text}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">Tap to reveal</span>
            )}
          </button>

          {revealed && (
            <div className="flex flex-wrap items-center justify-center gap-sm">
              <Button
                variant="danger"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "again" })}
              >
                Again
              </Button>
              <Button
                variant="warning"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "hard" })}
              >
                Hard
              </Button>
              <Button
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "good" })}
              >
                Good
              </Button>
              <Button
                variant="success"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "easy" })}
              >
                Easy
              </Button>
            </div>
          )}

          {revealed && (
            // Offered at the moment you've just seen the answer and decided
            // you're done with this card, rather than making you hunt for it
            // in the list below.
            <button
              type="button"
              disabled={excludeMutation.isPending}
              onClick={() => excludeMutation.mutate(currentCard.id)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Exclude this card from reviews
            </button>
          )}
        </>
      )}

      {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
      {actionError && (
        <p role="alert" className="text-xs text-danger">
          {actionError}
        </p>
      )}

      {cardsQuery.isError && (
        <p role="alert" className="text-sm text-danger">
          Failed to load this lesson&apos;s cards, so excluded ones can&apos;t be managed right now.
        </p>
      )}

      {lessonCards.length > 0 && (
        <section className="w-full max-w-[32rem]">
          <h2 className="mb-xs text-sm font-medium text-foreground">
            All cards in this lesson
            {excludedCount > 0 && (
              <span className="ml-xs font-normal text-muted-foreground">
                · {excludedCount} excluded
              </span>
            )}
          </h2>
          <ul className="flex flex-col gap-xs">
            {lessonCards.map((card) => (
              <LessonCardRow key={card.id} card={card} onChanged={refresh} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
