"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { ClozeRating } from "@lp/contracts";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { spliceClozeSpans } from "@/lib/text-offset";

import { ExtractedImage } from "./extracted-image";

export function ReviewTab({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const documentQuery = useQuery({
    queryKey: ["documents", documentId],
    queryFn: () => getBrowserApiClient().getDocument(documentId),
  });
  const dueQuery = useQuery({
    queryKey: ["cloze-cards", "due", documentId],
    queryFn: () => getBrowserApiClient().listDueClozeCards(documentId),
  });

  // Cards graded this session are tracked locally rather than relying on
  // the due-list query's own (invalidated, refetched) data to shrink —
  // that keeps the reading position stable even if a background refetch
  // reshapes dueQuery.data mid-session. At most one card is "revealed but
  // not yet graded" at a time; everything queued behind it stays hidden.
  const [gradedIds, setGradedIds] = useState<Set<string>>(new Set());
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: ClozeRating }) =>
      getBrowserApiClient().submitClozeReview(documentId, cardId, rating),
    onSuccess: (state, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cloze-cards", "due", documentId] });
      setGradedIds((prev) => new Set(prev).add(variables.cardId));
      setRevealedCardId(null);
      setFeedback(
        `Next review in ${state.interval_days} ${state.interval_days === 1 ? "day" : "days"}.`,
      );
    },
  });

  if (dueQuery.isPending || documentQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (dueQuery.isError || documentQuery.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load review cards.
      </p>
    );
  }

  const version = documentQuery.data?.current_version;
  const blocks = version?.extracted_content?.blocks ?? [];
  const dueCards = dueQuery.data ?? [];
  const queue = dueCards.filter((card) => !gradedIds.has(card.id));
  const currentCard = queue[0];

  // Every due card not yet graded renders hidden, except the one queue head
  // currently revealed (awaiting a grade) — grouped by block so a paragraph
  // with more than one due word renders each independently.
  const spansByBlock = new Map<
    number,
    { id: string; start_offset: number; end_offset: number; hidden: boolean }[]
  >();
  for (const card of dueCards) {
    if (gradedIds.has(card.id)) continue;
    const existing = spansByBlock.get(card.block_index) ?? [];
    existing.push({
      id: card.id,
      start_offset: card.start_offset,
      end_offset: card.end_offset,
      hidden: card.id !== revealedCardId,
    });
    spansByBlock.set(card.block_index, existing);
  }

  return (
    <div className="flex min-h-screen flex-col gap-md">
      {/* flex-1 so the bar below always ends up pinned at the bottom of the
          screen (via the sticky rule) even for a short lesson, instead of
          floating right after a couple of lines of text. */}
      <div className="flex-1">
        {version?.status === "processing" && (
          <p className="text-sm text-muted-foreground">Processing...</p>
        )}
        {version?.status === "failed" && (
          <p role="alert" className="text-sm text-danger">
            Processing failed: {version.error_message ?? "Unknown error"}
          </p>
        )}
        {version?.status === "ready" && (
          <article className="flex flex-col gap-md">
            {blocks.map((block, index) => {
              if (block.type === "heading") {
                return (
                  <h2 key={index} className="text-xl font-semibold text-foreground">
                    {block.text}
                  </h2>
                );
              }
              if (block.type === "image") {
                return block.image_path ? (
                  <ExtractedImage key={index} path={block.image_path} />
                ) : null;
              }
              const segments = spliceClozeSpans(block.text ?? "", spansByBlock.get(index) ?? []);
              return (
                <p key={index} className="text-base leading-relaxed text-foreground">
                  {segments.map((segment, i) =>
                    segment.hidden ? (
                      <span key={i} className="font-semibold text-muted-foreground">
                        [...]
                      </span>
                    ) : segment.id === currentCard?.id ? (
                      <span key={i} className="font-semibold text-primary">
                        {segment.text}
                      </span>
                    ) : (
                      <span key={i}>{segment.text}</span>
                    ),
                  )}
                </p>
              );
            })}
          </article>
        )}
      </div>

      {/* sticky (not fixed) so this only ever spans the lesson column's own
          width, same as the rest of this tab's content — a fixed bar would
          stretch across the Contents and Notes side panels too. */}
      <div className="sticky bottom-0 z-10 -mx-xl border-t border-border bg-background px-xl py-md">
        <div className="flex items-center justify-center gap-sm">
          {!currentCard && (
            <p className="text-sm text-muted-foreground">
              You&apos;re all caught up — nothing to review right now.
            </p>
          )}
          {currentCard && revealedCardId !== currentCard.id && (
            <>
              <p className="text-xs text-muted-foreground">
                {queue.length} {queue.length === 1 ? "word" : "words"} left to review
              </p>
              <Button onClick={() => setRevealedCardId(currentCard.id)}>Show</Button>
            </>
          )}
          {currentCard && revealedCardId === currentCard.id && (
            <>
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
            </>
          )}
          {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
        </div>
      </div>
    </div>
  );
}
