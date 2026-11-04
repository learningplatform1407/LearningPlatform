"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";

import type { ClozeCard, ClozeRating, ExtractedContent } from "@lp/contracts";

import { BottomNotch } from "@/components/bottom-notch";
import { Dot } from "@/components/dot";
import { CardsIcon, HistoryIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { spliceClozeSpans } from "@/lib/text-offset";
import { lightColors } from "@lp/ui";

import { ExtractedImage } from "./extracted-image";
import { GradeButtons, ShowButton, useGradeKeys } from "./grade-bar";

type Block = ExtractedContent["blocks"][number];

const GRADE_TINT: Record<ClozeRating, string> = {
  again: "bg-again-tint text-again",
  hard: "bg-hard-tint text-hard",
  good: "bg-good-tint text-good",
  easy: "bg-easy-tint text-easy",
};

const CLOZE_BASE = "rounded-[5px] px-[3px] font-bold";
/** A hidden gap shows a placeholder, never the answer: spliceClozeSpans
 * returns no text for it, so even a rendering slip can't leak it. The
 * design's type hints ("[ procent ]") need a hint per card, which cloze
 * cards don't carry -- so every gap is the hints-off "[ … ]". */
const GAP_TEXT = "[ … ]";

/**
 * Cloze reading (design.md §11): the whole lesson, with due phrases turned
 * into in-place gaps, graded from a bar glued to the bottom edge.
 *
 * Grades stay visible for the session as tinted words, so you can see how a
 * pass went; "Only what you missed" re-queues the ones graded Again or Hard.
 */
export function ReviewTab({
  documentId,
  textScale = 100,
}: {
  documentId: string;
  textScale?: number;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const documentQuery = useQuery({
    queryKey: ["documents", documentId],
    queryFn: () => getBrowserApiClient().getDocument(documentId),
  });
  const dueQuery = useQuery({
    queryKey: ["cloze-cards", "due", documentId],
    queryFn: () => getBrowserApiClient().listDueClozeCards(documentId),
  });

  // Grades given this session, kept locally rather than relying on the
  // due-list query's own (invalidated, refetched) data to shrink — that
  // keeps the reading position stable even if a background refetch
  // reshapes dueQuery.data mid-session.
  const [grades, setGrades] = useState<Map<string, ClozeRating>>(new Map());
  // Cards seen this session, in order -- a graded card may drop out of the
  // refetched due list, but it still has a place in the text.
  const [seen, setSeen] = useState<Map<string, ClozeCard>>(new Map());
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [oneAtATime, setOneAtATime] = useState(false);
  const [cardsView, setCardsView] = useState(false);

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: ClozeRating }) =>
      getBrowserApiClient().submitClozeReview(documentId, cardId, rating),
    onSuccess: (state, { cardId, rating }) => {
      void queryClient.invalidateQueries({ queryKey: ["cloze-cards", "due", documentId] });
      setGrades((previous) => new Map(previous).set(cardId, rating));
      setRevealedCardId(null);
      toast(`Next review in ${state.interval_days} ${state.interval_days === 1 ? "day" : "days"}.`);
    },
    onError: () => toast("That grade couldn't be saved."),
  });

  const dueCards = dueQuery.data ?? [];
  const allCards = [...seen.values(), ...dueCards.filter((card) => !seen.has(card.id))];
  // Remembered as soon as they're on screen, during render (not in an
  // effect) so the first paint already has them.
  if (dueCards.some((card) => !seen.has(card.id))) {
    const next = new Map(seen);
    for (const card of dueCards) if (!next.has(card.id)) next.set(card.id, card);
    setSeen(next);
  }

  const missed = (card: ClozeCard) =>
    grades.get(card.id) === "again" || grades.get(card.id) === "hard";
  const queue = onlyMissed
    ? allCards.filter(missed)
    : allCards.filter((card) => !grades.has(card.id));
  const current = queue[0];
  const revealed = current !== undefined && revealedCardId === current.id;

  function show() {
    if (current) setRevealedCardId(current.id);
  }

  function grade(rating: ClozeRating) {
    if (current && revealed && !reviewMutation.isPending) {
      reviewMutation.mutate({ cardId: current.id, rating });
    }
  }

  useGradeKeys(current !== undefined, { onShow: show, onGrade: grade });

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
  const pending = allCards.filter((card) => !grades.has(card.id)).length;
  const missedCount = allCards.filter(missed).length;

  function stateOf(card: ClozeCard): "current" | "hidden" | "shown" | ClozeRating {
    if (card.id === current?.id) return revealed ? "shown" : "current";
    const given = grades.get(card.id);
    if (given && !(onlyMissed && missed(card))) return given;
    return oneAtATime ? "shown" : "hidden";
  }

  const spansByBlock = new Map<number, { card: ClozeCard; hidden: boolean }[]>();
  for (const card of allCards) {
    const state = stateOf(card);
    const list = spansByBlock.get(card.block_index) ?? [];
    list.push({ card, hidden: state === "current" || state === "hidden" });
    spansByBlock.set(card.block_index, list);
  }

  /** `text` may be a slice of the block starting at `base` (the cards
   * view shows one sentence); spans are shifted to match. */
  function renderParagraph(text: string, blockIndex: number, base = 0): ReactNode[] {
    const spans = (spansByBlock.get(blockIndex) ?? []).filter(
      ({ card }) => card.start_offset >= base && card.end_offset <= base + text.length,
    );
    const segments = spliceClozeSpans(
      text,
      spans.map(({ card, hidden }) => ({
        id: card.id,
        start_offset: card.start_offset - base,
        end_offset: card.end_offset - base,
        hidden,
      })),
    );
    return segments.map((segment, i) => {
      const card = spans.find((s) => s.card.id === segment.id)?.card;
      if (!card) return <span key={i}>{segment.text}</span>;
      const state = stateOf(card);
      const isCurrent = card.id === current?.id;
      if (segment.hidden) {
        // A card that swallows the space around its word would glue the
        // placeholder to its neighbours; keep that space outside the gap.
        const lead = /^\s*/.exec(segment.text)![0];
        const trail = segment.text.trim() ? /\s*$/.exec(segment.text)![0] : "";
        return (
          <Fragment key={i}>
            {lead}
            <span
              className={`${CLOZE_BASE} border-b-2 border-cloze bg-cloze-bg text-[0.88em] font-semibold whitespace-nowrap text-cloze ${
                isCurrent ? "outline-2 outline-offset-2 outline-cloze" : ""
              }`}
            >
              {GAP_TEXT}
            </span>
            {trail}
          </Fragment>
        );
      }
      const tone =
        state === "shown"
          ? isCurrent
            ? "bg-cloze-bg text-foreground outline-2 outline-offset-2 outline-cloze"
            : "bg-cloze-bg text-cloze"
          : GRADE_TINT[state as ClozeRating];
      return (
        <span key={i} className={`${CLOZE_BASE} ${tone}`}>
          {segment.text}
        </span>
      );
    });
  }

  return (
    <div style={{ fontSize: `${(17 * textScale) / 100}px` }} className="leading-[1.6]">
      <p className="mb-sm text-sm font-semibold text-muted-foreground">
        {pending === 0 && !onlyMissed
          ? "You're all caught up — nothing to review right now."
          : onlyMissed
            ? `${queue.length} missed ${queue.length === 1 ? "word" : "words"} to go again`
            : `${pending} ${pending === 1 ? "word" : "words"} left to review`}
      </p>

      {version?.status === "processing" && (
        <p className="text-sm text-muted-foreground">Processing...</p>
      )}
      {version?.status === "failed" && (
        <p role="alert" className="text-sm text-danger">
          Processing failed: {version.error_message ?? "Unknown error"}
        </p>
      )}
      {version?.status === "ready" && (
        <article>
          {blocks.map((block, index) => {
            if (block.type === "heading") {
              return (
                <h3
                  key={index}
                  className="mt-[20px] border-t border-border pt-lg pb-1.5 text-[1.3em] leading-[1.25] font-extrabold first:mt-0"
                >
                  {block.text}
                </h3>
              );
            }
            if (block.type === "image") {
              return block.image_path ? (
                <div key={index} className="my-sm">
                  <ExtractedImage path={block.image_path} />
                </div>
              ) : null;
            }
            return (
              <p key={index} className="my-2 font-medium">
                {renderParagraph(block.text ?? "", index)}
              </p>
            );
          })}
        </article>
      )}

      {cardsView && current && (
        <CardsOverlay
          onClose={() => setCardsView(false)}
          section={sectionOf(blocks, current.block_index)}
          position={`${allCards.length - pending + 1} / ${allCards.length}`}
        >
          {renderSentence(blocks[current.block_index]?.text ?? "", current, (slice, base) =>
            renderParagraph(slice, current.block_index, base),
          )}
        </CardsOverlay>
      )}

      {(current || onlyMissed || missedCount > 0) && (
        <BottomNotch label="Review controls">
          <div className="flex gap-1.5 self-center">
            <Dot
              size="sm"
              aria-label="Cards, one at a time"
              title="Cards, one at a time"
              aria-pressed={cardsView}
              onClick={() => setCardsView((on) => !on)}
            >
              <CardsIcon />
            </Dot>
            <Dot
              size="sm"
              aria-label="Only what you missed"
              title="Only what you missed"
              aria-pressed={onlyMissed}
              onClick={() => {
                setOnlyMissed((on) => !on);
                setRevealedCardId(null);
              }}
            >
              <HistoryIcon />
            </Dot>
          </div>
          {current ? (
            revealed ? (
              <GradeButtons onGrade={grade} disabled={reviewMutation.isPending} />
            ) : (
              <ShowButton onShow={show} />
            )
          ) : (
            <p className="self-center px-md text-sm font-semibold text-muted-foreground">
              Nothing missed left to go over.
            </p>
          )}
          <div className="flex gap-1.5 self-center">
            <Dot
              size="sm"
              aria-label="One gap at a time"
              title="One gap at a time"
              aria-pressed={oneAtATime}
              onClick={() => setOneAtATime((on) => !on)}
            >
              <b>1</b>
            </Dot>
          </div>
        </BottomNotch>
      )}
    </div>
  );
}

function sectionOf(blocks: Block[], blockIndex: number): string {
  for (let i = blockIndex; i >= 0; i -= 1) {
    if (blocks[i]?.type === "heading") return blocks[i]!.text ?? "";
  }
  return "Review";
}

/** The sentence holding the gap, for the cards view (design.md §11). */
function renderSentence(
  text: string,
  card: ClozeCard,
  render: (slice: string, base: number) => ReactNode[],
): ReactNode {
  const before = text.slice(0, card.start_offset);
  const after = text.slice(card.end_offset);
  const startMatch = [...before.matchAll(/[.!?;]\s+/g)].pop();
  const start = startMatch ? startMatch.index + startMatch[0].length : 0;
  const endMatch = after.match(/[.!?;](\s|$)/);
  const end = endMatch ? card.end_offset + (endMatch.index ?? 0) + 1 : text.length;
  return (
    <>
      {start > 0 && "… "}
      {render(text.slice(start, end), start)}
      {end < text.length && " …"}
    </>
  );
}

// The card is light paper in both themes, so the marks on it use the light
// palette's colours rather than the (paler) dark-theme ones.
const PAPER_VARS = {
  "--foreground": lightColors.paperForeground,
  "--cloze": lightColors.cloze,
  "--cloze-bg": lightColors.clozeBg,
  "--again": lightColors.again,
  "--hard": lightColors.hard,
  "--good": lightColors.good,
  "--easy": lightColors.easy,
} as React.CSSProperties;

function CardsOverlay({
  section,
  position,
  onClose,
  children,
}: {
  section: string;
  position: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[54] flex items-center justify-center bg-scrim px-[50px] pt-[80px] pb-[140px] min-[721px]:px-[60px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Review card"
        style={PAPER_VARS}
        className="w-[min(560px,100%)] rounded-sheet bg-paper px-[30px] pt-[30px] pb-lg text-card leading-[1.5] text-paper-foreground shadow-card"
      >
        <div className="mb-3.5 flex justify-between gap-2.5 text-xs font-bold tracking-[0.1em] text-paper-muted-foreground uppercase">
          <span>{section}</span>
          <span>{position}</span>
        </div>
        <p className="m-0">{children}</p>
      </div>
    </div>
  );
}
