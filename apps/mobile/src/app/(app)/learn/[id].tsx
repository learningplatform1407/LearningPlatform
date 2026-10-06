import type {
  Annotation,
  AnnotationCreateRequest,
  ClozeRating,
  DocumentResponse,
  Flashcard,
  FlashcardScope,
  FlashcardScopeFilter,
  ReviewRating,
} from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import {
  NewEntryButtons,
  NotebookEntryEditor,
  NotebookEntryList,
} from "@/lib/notebook-entry-editor";
import { QuestionBankList } from "@/lib/question-bank-list";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";
import { spliceAnnotations, spliceClozeSpans } from "@/lib/text-offset";

function ExtractedImage({ path }: { path: string }) {
  const {
    data: url,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["document-image", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (isPending) {
    return (
      <View style={styles.imagePlaceholder}>
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  }
  if (isError || !url) {
    return (
      <View style={styles.imagePlaceholder}>
        <Text style={styles.error}>Failed to load image.</Text>
      </View>
    );
  }
  return (
    <Image
      testID="extracted-image"
      source={{ uri: url }}
      style={styles.image}
      resizeMode="contain"
    />
  );
}

function AnnotatedParagraph({
  text,
  blockIndex,
  annotations,
  onLongPress,
  onOpenNote,
}: {
  text: string;
  blockIndex: number;
  annotations: Annotation[];
  onLongPress: () => void;
  onOpenNote: (note: Annotation) => void;
}) {
  const blockAnnotations = annotations.filter((a) => a.block_index === blockIndex);
  const segments = spliceAnnotations(text, blockAnnotations);
  // RN's Text can only nest more Text as inline children — a note glyph
  // can't be placed inline mid-paragraph the way web does with a <span>, so
  // every margin note (block-level or range-anchored) surfaces as a badge
  // below the paragraph instead. Only highlight segments render styled.
  const notes = blockAnnotations.filter((a) => a.type === "margin_note");

  return (
    <View>
      <Pressable testID={`paragraph-${blockIndex}`} onLongPress={onLongPress}>
        <Text style={styles.paragraph}>
          {segments.map((segment, index) =>
            segment.annotation?.type === "highlight" ? (
              <Text
                key={index}
                style={{ backgroundColor: highlightMarkColor(segment.annotation.color) }}
              >
                {segment.text}
              </Text>
            ) : (
              <Text key={index}>{segment.text}</Text>
            ),
          )}
        </Text>
      </Pressable>
      {notes.length > 0 && (
        <View style={styles.noteRow}>
          {notes.map((note) => (
            <Pressable
              key={note.id}
              onPress={() => onOpenNote(note)}
              style={styles.noteBadge}
              accessibilityRole="button"
            >
              <Text style={styles.noteBadgeText}>note</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const TABS = [
  { key: "lesson", label: "Lesson" },
  { key: "review", label: "Review" },
  { key: "quizzes", label: "Quizzes" },
  { key: "flashcards", label: "Flashcards" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const HIGHLIGHT_COLORS = [
  { name: "yellow", swatch: "#FDE047", mark: "#FEF08A" },
  { name: "green", swatch: "#4ADE80", mark: "#BBF7D0" },
  { name: "blue", swatch: "#60A5FA", mark: "#BFDBFE" },
  { name: "pink", swatch: "#F472B6", mark: "#FBCFE8" },
] as const;

function highlightMarkColor(color: string | null): string {
  return HIGHLIGHT_COLORS.find((c) => c.name === color)?.mark ?? HIGHLIGHT_COLORS[0].mark;
}

type ActiveTool = { type: "highlight"; color: string } | { type: "eraser" } | null;

// Debounce for detecting "the user finished selecting" — RN's TextInput
// onSelectionChange fires continuously while dragging, with no distinct
// "selection ended" event the way web's mouseup gives us.
const SELECTION_SETTLE_MS = 400;

function AnnotationToolbar({
  activeTool,
  onToolChange,
}: {
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
}) {
  return (
    <View style={styles.annotationToolbar} accessibilityRole="toolbar">
      {HIGHLIGHT_COLORS.map((color) => {
        const isActive = activeTool?.type === "highlight" && activeTool.color === color.name;
        return (
          <Pressable
            key={color.name}
            onPress={() => onToolChange(isActive ? null : { type: "highlight", color: color.name })}
            accessibilityRole="button"
            accessibilityLabel={`Highlight — ${color.name}`}
            accessibilityState={{ selected: isActive }}
            style={[
              styles.colorSwatch,
              { backgroundColor: color.swatch },
              isActive && styles.colorSwatchActive,
            ]}
          />
        );
      })}
      <Pressable
        onPress={() => onToolChange(activeTool?.type === "eraser" ? null : { type: "eraser" })}
        accessibilityRole="button"
        accessibilityLabel="Eraser"
        accessibilityState={{ selected: activeTool?.type === "eraser" }}
        style={[styles.eraserButton, activeTool?.type === "eraser" && styles.eraserButtonActive]}
      >
        <Text style={styles.eraserButtonText}>🧹</Text>
      </Pressable>
    </View>
  );
}

function SelectableParagraph({
  text,
  blockIndex,
  onSelectionSettled,
}: {
  text: string;
  blockIndex: number;
  onSelectionSettled: (blockIndex: number, start: number, end: number) => void;
}) {
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <TextInput
      testID={`selectable-paragraph-${blockIndex}`}
      style={styles.paragraph}
      value={text}
      editable={false}
      multiline
      selection={selection}
      onSelectionChange={(event) => {
        const next = event.nativeEvent.selection;
        setSelection(next);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (next.start === next.end) return;
        timerRef.current = setTimeout(() => {
          onSelectionSettled(blockIndex, next.start, next.end);
          setSelection({ start: 0, end: 0 });
        }, SELECTION_SETTLE_MS);
      }}
    />
  );
}

function QuizzesTab({ documentId }: { documentId: string }) {
  // Scoped by questions.document_id — a question's provenance, and the only
  // link between a lesson and a question. Lessons carry no tags of their
  // own, so "this lesson's questions" means exactly this.
  return (
    <View style={styles.quizzesTab}>
      <QuestionBankList
        filter={{ documentIds: [documentId] }}
        emptyMessage="No questions for this lesson yet."
      />
      <Pressable onPress={() => router.push("/exams")}>
        <Text style={styles.tabLink}>Practise in an exam →</Text>
      </Pressable>
    </View>
  );
}

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
    <View style={styles.scopeToggle} accessibilityRole="radiogroup">
      {SCOPE_FILTERS.map((filter) => (
        <Pressable
          key={filter.key}
          onPress={() => onChange(filter.key)}
          accessibilityRole="radio"
          accessibilityState={{ selected: scope === filter.key }}
          style={[styles.scopeButton, scope === filter.key && styles.scopeButtonActive]}
        >
          <Text
            style={[styles.scopeButtonText, scope === filter.key && styles.scopeButtonTextActive]}
          >
            {filter.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Official vs personal, always paired with a word rather than colour alone. */
function ScopeBadge({ scope }: { scope: FlashcardScope }) {
  return (
    <View style={styles.scopeBadge}>
      <Text style={styles.scopeBadgeText}>{scope === "official" ? "Official" : "Mine"}</Text>
    </View>
  );
}

function AddFlashcardForm({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      getApiClient().createFlashcard(documentId, { front_text: front, back_text: back }),
    onSuccess: onDone,
    onError: () => setError("Could not save that card."),
  });

  return (
    <View style={styles.cardForm}>
      <Text style={styles.formLabel}>Front</Text>
      <TextInput
        accessibilityLabel="Front"
        value={front}
        onChangeText={setFront}
        style={styles.formInput}
      />
      <Text style={styles.formLabel}>Back</Text>
      <TextInput
        accessibilityLabel="Back"
        value={back}
        onChangeText={setBack}
        multiline
        style={[styles.formInput, styles.formInputMultiline]}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.formActions}>
        <Pressable
          disabled={front.trim() === "" || back.trim() === "" || create.isPending}
          onPress={() => create.mutate()}
          accessibilityRole="button"
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Save card</Text>
        </Pressable>
        <Pressable onPress={onDone} accessibilityRole="button" style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
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
      getApiClient().updateFlashcard(card.id, { front_text: front, back_text: back }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onChanged();
    },
    onError: () => setError("Could not save that card."),
  });
  const remove = useMutation({
    mutationFn: () => getApiClient().deleteFlashcard(card.id),
    onSuccess: onChanged,
    onError: () => setError("Could not delete that card."),
  });
  const suspension = useMutation({
    mutationFn: () => getApiClient().setFlashcardSuspension(card.id, !card.suspended),
    onSuccess: onChanged,
    // This toggle is the only route back into the rotation, so a silent
    // failure would leave the learner unable to tell the card is still out.
    onError: () =>
      setError(card.suspended ? "Could not include that card." : "Could not exclude that card."),
  });

  if (editing) {
    return (
      <View style={styles.cardForm}>
        <TextInput
          accessibilityLabel="Front"
          value={front}
          onChangeText={setFront}
          style={styles.formInput}
        />
        <TextInput
          accessibilityLabel="Back"
          value={back}
          onChangeText={setBack}
          multiline
          style={[styles.formInput, styles.formInputMultiline]}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.formActions}>
          <Pressable
            disabled={!front.trim() || !back.trim() || update.isPending}
            onPress={() => update.mutate()}
            accessibilityRole="button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Save</Text>
          </Pressable>
          <Pressable
            onPress={() => setEditing(false)}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.myCardRow, card.suspended && styles.myCardRowSuspended]}>
      <View style={styles.myCardText}>
        <Text style={styles.rowTitle}>{card.front_text}</Text>
        <Text style={styles.hint}>{card.back_text}</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
      <View style={styles.myCardActions}>
        <ScopeBadge scope={card.scope} />
        {card.suspended && (
          <View style={styles.scopeBadge}>
            <Text style={styles.scopeBadgeText}>Not in rotation</Text>
          </View>
        )}
        {/* Offered on every visible card, official included — suspension is
            the caller's own review state, not a change to shared content.
            This row is the only place a suspended card is still listed, so
            it is the only way back into the rotation. */}
        <Pressable
          disabled={suspension.isPending}
          onPress={() => suspension.mutate()}
          accessibilityRole="button"
          accessibilityState={{ selected: !card.suspended }}
        >
          <Text style={styles.linkText}>
            {card.suspended ? "Include in reviews" : "Exclude from reviews"}
          </Text>
        </Pressable>
        {card.is_mine && (
          <>
            <Pressable onPress={openEditor} accessibilityRole="button">
              <Text style={styles.linkText}>Edit</Text>
            </Pressable>
            <Pressable
              disabled={remove.isPending}
              onPress={() => remove.mutate()}
              accessibilityRole="button"
            >
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function FlashcardsTab({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<FlashcardScopeFilter>("all");
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [gradedIds, setGradedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const deckQuery = useQuery({
    queryKey: ["flashcards", "due", documentId, scope],
    queryFn: () => getApiClient().listDueFlashcards(documentId, { scope }),
  });
  // Every visible card, not just the learner's own: this list is where a
  // suspended card is re-included, and a suspended card is absent from the
  // deck and from every count, so a personal-only list would leave an
  // excluded official card with no way back in.
  const cardsQuery = useQuery({
    queryKey: ["flashcards", "lesson", documentId],
    queryFn: () => getApiClient().listFlashcards(documentId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["flashcards"] });
  }

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: ReviewRating }) =>
      getApiClient().submitFlashcardReview(cardId, rating),
    onSuccess: (state, variables) => {
      setGradedIds((previous) => new Set(previous).add(variables.cardId));
      setRevealedCardId(null);
      setActionError(null);
      setFeedback(
        `Next review in ${state.interval_days} ${state.interval_days === 1 ? "day" : "days"}.`,
      );
      refresh();
    },
    // Without this a failed grade silently does nothing: the card stays
    // revealed, the buttons re-enable, and the learner has no idea the
    // rating never landed.
    onError: () => setActionError("Could not save that rating."),
  });

  const excludeMutation = useMutation({
    mutationFn: (cardId: string) => getApiClient().setFlashcardSuspension(cardId, true),
    onSuccess: (_state, cardId) => {
      // Reuses gradedIds: from the runner's point of view an excluded card
      // is simply done with for this session, and the server has already
      // dropped it from the deck.
      setGradedIds((previous) => new Set(previous).add(cardId));
      setRevealedCardId(null);
      setActionError(null);
      setFeedback("Excluded from reviews. You can include it again below.");
      refresh();
    },
    onError: () => setActionError("Could not exclude that card."),
  });

  // Filtered client-side rather than trusting the refetched list to shrink,
  // so a background refetch can't move the card out from under you — same
  // reasoning as the Review tab.
  const queue = (deckQuery.data ?? []).filter((card) => !gradedIds.has(card.id));
  const currentCard = queue[0];
  const revealed = currentCard !== undefined && revealedCardId === currentCard.id;

  if (deckQuery.isPending) {
    return <Text style={styles.hint}>Loading...</Text>;
  }
  if (deckQuery.isError) {
    return <Text style={styles.errorText}>Failed to load flashcards.</Text>;
  }

  const lessonCards = cardsQuery.data ?? [];
  const excludedCount = lessonCards.filter((card) => card.suspended).length;

  return (
    <View style={styles.flashcardsTab}>
      <View style={styles.flashcardsHeader}>
        <ScopeToggle
          scope={scope}
          onChange={(next) => {
            // The deck is re-keyed by scope, so the session state derived
            // from it has to go too — otherwise "Card 4 of 5" carries over
            // from the previous scope onto a shorter deck.
            setScope(next);
            setGradedIds(new Set());
            setRevealedCardId(null);
            setFeedback(null);
            setActionError(null);
          }}
        />
        {!adding && (
          <Pressable
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Add a card</Text>
          </Pressable>
        )}
      </View>

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
        <Text style={styles.hint}>
          {/* Tests the lesson's cards, not the deck: with every card
              excluded the deck is empty while the lesson is not, and the
              "no flashcards yet" copy would contradict the list below. */}
          {lessonCards.length === 0 && cardsQuery.isSuccess && gradedIds.size === 0
            ? "No flashcards for this lesson yet. Add your own, or check back for official ones."
            : "You're all caught up — nothing to review right now."}
        </Text>
      )}

      {currentCard && (
        <>
          <Text style={styles.hint}>
            Card {gradedIds.size + 1} of {gradedIds.size + queue.length}
          </Text>
          <Pressable
            onPress={() => setRevealedCardId(currentCard.id)}
            accessibilityRole="button"
            accessibilityState={{ expanded: revealed }}
            style={styles.flashcard}
          >
            <ScopeBadge scope={currentCard.scope} />
            <Text style={styles.flashcardFront}>{currentCard.front_text}</Text>
            {revealed ? (
              <Text style={styles.flashcardBack}>{currentCard.back_text}</Text>
            ) : (
              <Text style={styles.hint}>Tap to reveal</Text>
            )}
          </Pressable>

          {revealed && (
            <View style={styles.gradeRow}>
              <Pressable
                disabled={reviewMutation.isPending}
                onPress={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "again" })}
                accessibilityRole="button"
                style={styles.gradeButton}
              >
                <Text style={styles.deleteText}>Again</Text>
              </Pressable>
              <Pressable
                disabled={reviewMutation.isPending}
                onPress={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "hard" })}
                accessibilityRole="button"
                style={styles.gradeButton}
              >
                <Text style={styles.reviewWarningText}>Hard</Text>
              </Pressable>
              <Pressable
                disabled={reviewMutation.isPending}
                onPress={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "good" })}
                accessibilityRole="button"
                style={styles.gradeButton}
              >
                <Text style={styles.rowTitle}>Good</Text>
              </Pressable>
              <Pressable
                disabled={reviewMutation.isPending}
                onPress={() => reviewMutation.mutate({ cardId: currentCard.id, rating: "easy" })}
                accessibilityRole="button"
                style={styles.gradeButton}
              >
                <Text style={styles.reviewSuccessText}>Easy</Text>
              </Pressable>
            </View>
          )}

          {revealed && (
            // Offered at the moment you've just seen the answer and decided
            // you're done with this card, rather than making you hunt for it
            // in the list below.
            <Pressable
              disabled={excludeMutation.isPending}
              onPress={() => excludeMutation.mutate(currentCard.id)}
              accessibilityRole="button"
            >
              <Text style={styles.hint}>Exclude this card from reviews</Text>
            </Pressable>
          )}
        </>
      )}

      {feedback && <Text style={styles.hint}>{feedback}</Text>}
      {actionError && <Text style={styles.errorText}>{actionError}</Text>}

      {cardsQuery.isError && (
        <Text style={styles.errorText}>
          Failed to load this lesson&apos;s cards, so excluded ones can&apos;t be managed right now.
        </Text>
      )}

      {lessonCards.length > 0 && (
        <View style={styles.myCardsSection}>
          <Text style={styles.myCardsHeading}>
            All cards in this lesson
            {excludedCount > 0 ? ` · ${excludedCount} excluded` : ""}
          </Text>
          <View style={styles.tabList}>
            {lessonCards.map((card) => (
              <LessonCardRow key={card.id} card={card} onChanged={refresh} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

type ClozeSpanState = { id: string; start_offset: number; end_offset: number; hidden: boolean };

/**
 * Owns all Review-tab state/data (the due queue, which card is currently
 * revealed, grading) independently of where it's rendered. Split out from
 * the review UI itself because the review bar has to live *outside* the
 * screen's ScrollView to stay pinned to the bottom of the viewport while
 * the lesson content scrolls underneath it -- see ReviewArticle/ReviewBar
 * below and their call sites in LectureScreen.
 */
function useClozeReview(documentId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const dueQuery = useQuery({
    queryKey: ["cloze-cards", "due", documentId],
    queryFn: () => getApiClient().listDueClozeCards(documentId),
    enabled,
  });

  // Cards graded this session are tracked locally rather than relying on
  // the due-list query's own (invalidated, refetched) data to shrink --
  // that keeps the reading position stable even if a background refetch
  // reshapes dueQuery.data mid-session. At most one card is "revealed but
  // not yet graded" at a time; everything queued behind it stays hidden.
  const [gradedIds, setGradedIds] = useState<Set<string>>(new Set());
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: ClozeRating }) =>
      getApiClient().submitClozeReview(documentId, cardId, rating),
    onSuccess: (state, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cloze-cards", "due", documentId] });
      setGradedIds((prev) => new Set(prev).add(variables.cardId));
      setRevealedCardId(null);
      setFeedback(
        `Next review in ${state.interval_days} ${state.interval_days === 1 ? "day" : "days"}.`,
      );
    },
  });

  const dueCards = dueQuery.data ?? [];
  const queue = dueCards.filter((card) => !gradedIds.has(card.id));
  const currentCard = queue[0];

  // Every due card not yet graded renders hidden, except the one queue head
  // currently revealed (awaiting a grade) -- grouped by block so a
  // paragraph with more than one due word renders each independently.
  const spansByBlock = new Map<number, ClozeSpanState[]>();
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

  return {
    isPending: dueQuery.isPending,
    isError: dueQuery.isError,
    spansByBlock,
    currentCardId: currentCard?.id,
    isRevealed: currentCard !== undefined && revealedCardId === currentCard.id,
    queueLength: queue.length,
    feedback,
    isGrading: reviewMutation.isPending,
    reveal: () => {
      if (!currentCard) return;
      setRevealedCardId(currentCard.id);
      setFeedback(null);
    },
    grade: (rating: ClozeRating) => {
      if (!currentCard) return;
      reviewMutation.mutate({ cardId: currentCard.id, rating });
    },
  };
}

function ReviewArticle({
  version,
  spansByBlock,
  currentCardId,
}: {
  version: DocumentResponse["current_version"] | undefined;
  spansByBlock: Map<number, ClozeSpanState[]>;
  currentCardId: string | undefined;
}) {
  if (!version) return <Text style={styles.hint}>Not processed yet.</Text>;
  if (version.status === "processing") return <Text style={styles.hint}>Processing...</Text>;
  if (version.status === "failed") {
    return (
      <Text style={styles.error}>
        Processing failed: {version.error_message ?? "Unknown error"}
      </Text>
    );
  }
  if (version.status !== "ready" || !version.extracted_content) return null;

  return (
    <>
      {version.extracted_content.blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <Text key={index} style={styles.heading}>
              {block.text}
            </Text>
          );
        }
        if (block.type === "image") {
          return block.image_path ? <ExtractedImage key={index} path={block.image_path} /> : null;
        }
        const segments = spliceClozeSpans(block.text ?? "", spansByBlock.get(index) ?? []);
        return (
          <Text key={index} style={styles.paragraph}>
            {segments.map((segment, i) =>
              segment.hidden ? (
                <Text key={i} style={styles.clozeHidden}>
                  [...]
                </Text>
              ) : segment.id === currentCardId ? (
                <Text key={i} style={styles.clozeRevealed}>
                  {segment.text}
                </Text>
              ) : (
                <Text key={i}>{segment.text}</Text>
              ),
            )}
          </Text>
        );
      })}
    </>
  );
}

function ReviewBar({ review }: { review: ReturnType<typeof useClozeReview> }) {
  if (review.isPending) {
    return (
      <View style={styles.reviewBar}>
        <Text style={styles.hint}>Loading...</Text>
      </View>
    );
  }
  if (review.isError) {
    return (
      <View style={styles.reviewBar}>
        <Text style={styles.error}>Failed to load review cards.</Text>
      </View>
    );
  }

  return (
    <View style={styles.reviewBar}>
      {!review.currentCardId && (
        <>
          <Text style={styles.hint}>You&apos;re all caught up — nothing to review right now.</Text>
          {review.feedback && <Text style={styles.hint}>{review.feedback}</Text>}
        </>
      )}
      {review.currentCardId && !review.isRevealed && (
        <View style={styles.reviewBarRow}>
          <Text style={styles.hint}>
            {review.queueLength} {review.queueLength === 1 ? "word" : "words"} left to review
          </Text>
          <Pressable
            style={[styles.modalButton, styles.modalButtonPrimary]}
            onPress={review.reveal}
            accessibilityRole="button"
          >
            <Text style={styles.modalButtonPrimaryText}>Show</Text>
          </Pressable>
        </View>
      )}
      {review.currentCardId && review.isRevealed && (
        <View style={styles.reviewGradeRow}>
          <Pressable
            style={styles.modalButton}
            disabled={review.isGrading}
            onPress={() => review.grade("again")}
            accessibilityRole="button"
          >
            <Text style={styles.deleteText}>Again</Text>
          </Pressable>
          <Pressable
            style={styles.modalButton}
            disabled={review.isGrading}
            onPress={() => review.grade("hard")}
            accessibilityRole="button"
          >
            <Text style={styles.reviewWarningText}>Hard</Text>
          </Pressable>
          <Pressable
            style={[styles.modalButton, styles.modalButtonPrimary]}
            disabled={review.isGrading}
            onPress={() => review.grade("good")}
            accessibilityRole="button"
          >
            <Text style={styles.modalButtonPrimaryText}>Good</Text>
          </Pressable>
          <Pressable
            style={styles.modalButton}
            disabled={review.isGrading}
            onPress={() => review.grade("easy")}
            accessibilityRole="button"
          >
            <Text style={styles.reviewSuccessText}>Easy</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

type NotesView =
  | { kind: "list" }
  | { kind: "entry"; entryId: string }
  | { kind: "new-text" }
  | { kind: "new-drawing" };

function TocModal({
  visible,
  onClose,
  scopeId,
  currentDocumentId,
}: {
  visible: boolean;
  onClose: () => void;
  scopeId: string;
  currentDocumentId: string;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["documents", scopeId],
    queryFn: () => getApiClient().listDocuments(scopeId),
    enabled: visible,
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlayContainer}>
        <View style={styles.overlayHeader}>
          <Text style={styles.overlayTitle}>Contents</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.overlayClose}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.overlayContent}>
          {isPending && <Text style={styles.hint}>Loading...</Text>}
          {!isPending && (!data || data.length === 0) && (
            <Text style={styles.hint}>No lessons.</Text>
          )}
          {data?.map((doc) => (
            <Pressable
              key={doc.id}
              style={[styles.tocRow, doc.id === currentDocumentId && styles.tocRowActive]}
              onPress={() => {
                onClose();
                router.push(`/learn/${doc.id}`);
              }}
              accessibilityRole="button"
            >
              <Text
                style={[styles.rowTitle, doc.id === currentDocumentId && styles.tocRowActiveText]}
              >
                {doc.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function NotesModal({
  visible,
  onClose,
  documentId,
}: {
  visible: boolean;
  onClose: () => void;
  documentId: string;
}) {
  const [view, setView] = useState<NotesView>({ kind: "list" });
  const entries = useQuery({
    queryKey: ["notebook-entries"],
    queryFn: () => getApiClient().listNotebookEntries(),
    enabled: visible,
  });

  const selectedEntry =
    view.kind === "entry" ? entries.data?.find((e) => e.id === view.entryId) : undefined;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlayContainer}>
        <View style={styles.overlayHeader}>
          <Text style={styles.overlayTitle}>Notes</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.overlayClose}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.overlayContent}>
          {entries.isPending && <Text style={styles.hint}>Loading...</Text>}
          {entries.isError && <Text style={styles.error}>Failed to load notes.</Text>}
          {entries.data && (
            <>
              {view.kind !== "list" && (
                <Pressable onPress={() => setView({ kind: "list" })} accessibilityRole="button">
                  <Text style={styles.backLink}>← Notes</Text>
                </Pressable>
              )}
              {view.kind === "list" && (
                <NotebookEntryList
                  entries={entries.data}
                  onSelect={(entryId) => setView({ kind: "entry", entryId })}
                />
              )}
              {view.kind === "new-text" && (
                <NotebookEntryEditor
                  type="text"
                  sourceDocumentId={documentId}
                  onCreated={(id) => setView({ kind: "entry", entryId: id })}
                />
              )}
              {view.kind === "new-drawing" && (
                <NotebookEntryEditor
                  type="drawing"
                  sourceDocumentId={documentId}
                  onCreated={(id) => setView({ kind: "entry", entryId: id })}
                />
              )}
              {view.kind === "entry" && selectedEntry && (
                <NotebookEntryEditor
                  key={selectedEntry.id}
                  entry={selectedEntry}
                  onDeleted={() => setView({ kind: "list" })}
                />
              )}
            </>
          )}
        </ScrollView>
        {view.kind === "list" && (
          <View style={styles.overlayFooter}>
            <NewEntryButtons
              onNewText={() => setView({ kind: "new-text" })}
              onNewDrawing={() => setView({ kind: "new-drawing" })}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

export default function LectureScreen() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const queryClient = useQueryClient();
  // Deep link support: navigating here with ?tab=review (e.g. from the
  // review dashboard) opens straight to that tab instead of always
  // starting on Lesson.
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "lesson",
  );
  const [tocOpen, setTocOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const review = useClozeReview(id, activeTab === "review");

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["documents", id],
    queryFn: () => getApiClient().getDocument(id),
  });
  const version = data?.current_version;

  const { data: annotations = [] } = useQuery({
    queryKey: ["annotations", id],
    queryFn: () => getApiClient().listAnnotations(id),
    enabled: version?.status === "ready",
  });

  const [actionMenuBlockIndex, setActionMenuBlockIndex] = useState<number | null>(null);
  const [composingBlockIndex, setComposingBlockIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [viewingNote, setViewingNote] = useState<Annotation | null>(null);
  const [explainComingSoonVisible, setExplainComingSoonVisible] = useState(false);

  const createNoteMutation = useMutation({
    mutationFn: (blockIndex: number) =>
      getApiClient().createAnnotation(id, {
        type: "margin_note",
        block_index: blockIndex,
        note_text: noteDraft.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", id] });
      setComposingBlockIndex(null);
      setNoteDraft("");
    },
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: (annotationId: string) => getApiClient().deleteAnnotation(id, annotationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", id] });
      setViewingNote(null);
    },
  });

  const createAnnotationMutation = useMutation({
    mutationFn: (body: AnnotationCreateRequest) => getApiClient().createAnnotation(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["annotations", id] }),
  });

  function handleSelectionSettled(blockIndex: number, start: number, end: number) {
    if (start === end) return;

    if (activeTool?.type === "highlight") {
      createAnnotationMutation.mutate({
        type: "highlight",
        block_index: blockIndex,
        start_offset: start,
        end_offset: end,
        color: activeTool.color,
      });
      return;
    }

    if (activeTool?.type === "eraser") {
      const overlapping = annotations.filter(
        (a) =>
          a.type === "highlight" &&
          a.block_index === blockIndex &&
          a.start_offset !== null &&
          a.end_offset !== null &&
          a.start_offset < end &&
          a.end_offset > start,
      );
      // Same partial-trim behavior as web: erasing only removes the selected
      // portion — the original annotation is deleted and replaced with
      // whatever's left before/after the erased range.
      for (const a of overlapping) {
        const before = a.start_offset! < start ? { start: a.start_offset!, end: start } : null;
        const after = a.end_offset! > end ? { start: end, end: a.end_offset! } : null;

        deleteAnnotationMutation.mutate(a.id);
        if (before) {
          createAnnotationMutation.mutate({
            type: "highlight",
            block_index: blockIndex,
            start_offset: before.start,
            end_offset: before.end,
            color: a.color,
          });
        }
        if (after) {
          createAnnotationMutation.mutate({
            type: "highlight",
            block_index: blockIndex,
            start_offset: after.start,
            end_offset: after.end,
            color: a.color,
          });
        }
      }
    }
  }

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load lecture: {(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screenRoot}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          activeTab === "review" && styles.contentWithReviewBar,
        ]}
      >
        <Pressable onPress={() => router.push("/learn")} accessibilityRole="button">
          <Text style={styles.backLink}>← Learn</Text>
        </Pressable>
        {data.sub_chapter && (
          <Pressable
            onPress={() =>
              router.push(
                `/learn/library/${data.sub_chapter!.chapter.book_id}/${data.sub_chapter!.chapter.id}`,
              )
            }
            accessibilityRole="button"
          >
            <Text style={styles.breadcrumb}>
              {data.sub_chapter.chapter.title} / {data.sub_chapter.title}
            </Text>
          </Pressable>
        )}
        <Text style={styles.title}>{data.title}</Text>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setTocOpen(true)}
            style={styles.headerActionButton}
            accessibilityRole="button"
          >
            <Text style={styles.headerActionText}>Contents</Text>
          </Pressable>
          <Pressable
            onPress={() => setNotesOpen(true)}
            style={styles.headerActionButton}
            accessibilityRole="button"
          >
            <Text style={styles.headerActionText}>Notes</Text>
          </Pressable>
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              accessibilityRole="button"
            >
              <Text
                style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === "review" && (
          <ReviewArticle
            version={version}
            spansByBlock={review.spansByBlock}
            currentCardId={review.currentCardId}
          />
        )}
        {activeTab === "quizzes" && <QuizzesTab documentId={id} />}
        {activeTab === "flashcards" && <FlashcardsTab documentId={id} />}

        {activeTab === "lesson" && (
          <>
            <AnnotationToolbar activeTool={activeTool} onToolChange={setActiveTool} />

            {!version && <Text style={styles.hint}>Not processed yet.</Text>}
            {version?.status === "processing" && <Text style={styles.hint}>Processing...</Text>}
            {version?.status === "failed" && (
              <Text style={styles.error}>
                Processing failed: {version.error_message ?? "Unknown error"}
              </Text>
            )}
            {version?.status === "ready" &&
              version.extracted_content &&
              version.extracted_content.blocks.map((block, index) => {
                if (block.type === "heading") {
                  return (
                    <Text key={index} style={styles.heading}>
                      {block.text}
                    </Text>
                  );
                }
                if (block.type === "image") {
                  return block.image_path ? (
                    <ExtractedImage key={index} path={block.image_path} />
                  ) : null;
                }
                if (activeTool) {
                  return (
                    <SelectableParagraph
                      key={index}
                      text={block.text ?? ""}
                      blockIndex={index}
                      onSelectionSettled={handleSelectionSettled}
                    />
                  );
                }
                return (
                  <AnnotatedParagraph
                    key={index}
                    text={block.text ?? ""}
                    blockIndex={index}
                    annotations={annotations}
                    onLongPress={() => setActionMenuBlockIndex(index)}
                    onOpenNote={setViewingNote}
                  />
                );
              })}
          </>
        )}
      </ScrollView>

      {activeTab === "review" && <ReviewBar review={review} />}

      <Modal
        visible={actionMenuBlockIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuBlockIndex(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Pressable
              onPress={() => {
                setComposingBlockIndex(actionMenuBlockIndex);
                setActionMenuBlockIndex(null);
              }}
              style={styles.actionMenuItem}
              accessibilityRole="button"
              // The header's "Notes" button (whole-lesson notes panel) has the
              // same visible label as this menu item (adds a margin note on
              // the selected block) — distinct accessible names keep screen
              // readers from announcing two identically-named buttons.
              accessibilityLabel="Add note"
            >
              <Text style={styles.actionMenuItemText}>Notes</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setExplainComingSoonVisible(true);
                setActionMenuBlockIndex(null);
              }}
              style={styles.actionMenuItem}
              accessibilityRole="button"
            >
              <Text style={styles.actionMenuItemText}>Explain</Text>
            </Pressable>
            <Pressable
              onPress={() => setActionMenuBlockIndex(null)}
              style={styles.modalButton}
              accessibilityRole="button"
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={explainComingSoonVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExplainComingSoonVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Explain</Text>
            <Text style={styles.hint}>AI explanations are coming soon.</Text>
            <Pressable
              onPress={() => setExplainComingSoonVisible(false)}
              style={[styles.modalButton, styles.modalButtonPrimary]}
              accessibilityRole="button"
            >
              <Text style={styles.modalButtonPrimaryText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={composingBlockIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setComposingBlockIndex(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a note</Text>
            <TextInput
              style={styles.modalInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Note..."
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setComposingBlockIndex(null);
                  setNoteDraft("");
                }}
                style={styles.modalButton}
                accessibilityRole="button"
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  composingBlockIndex !== null && createNoteMutation.mutate(composingBlockIndex)
                }
                style={[styles.modalButton, styles.modalButtonPrimary]}
                disabled={!noteDraft.trim() || createNoteMutation.isPending}
                accessibilityRole="button"
              >
                {createNoteMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={viewingNote !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingNote(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Note</Text>
            <Text style={styles.noteText}>{viewingNote?.note_text}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setViewingNote(null)}
                style={styles.modalButton}
                accessibilityRole="button"
              >
                <Text style={styles.modalButtonText}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => viewingNote && deleteAnnotationMutation.mutate(viewingNote.id)}
                style={styles.modalButton}
                accessibilityRole="button"
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <TocModal
        visible={tocOpen}
        onClose={() => setTocOpen(false)}
        scopeId={data.sub_chapter?.id ?? "none"}
        currentDocumentId={id}
      />
      <NotesModal visible={notesOpen} onClose={() => setNotesOpen(false)} documentId={id} />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  contentWithReviewBar: {
    // Keeps the last line of lesson text from sitting under the fixed
    // review bar at the bottom of the screen.
    paddingBottom: spacing.xl * 3,
  },
  backLink: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  breadcrumb: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  headerActionButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  headerActionText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  overlayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  overlayTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  overlayClose: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.primary,
  },
  overlayContent: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  overlayFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  tocRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tocRowActive: {
    backgroundColor: colors.muted,
  },
  tocRowActiveText: {
    fontWeight: fontWeights.semibold,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  annotationToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  colorSwatch: {
    height: 28,
    width: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: colors.primary,
  },
  eraserButton: {
    height: 28,
    width: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  eraserButtonActive: {
    backgroundColor: colors.muted,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  eraserButtonText: {
    fontSize: fontSizes.sm,
  },
  tabButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
  },
  tabButtonTextActive: {
    color: colors.foreground,
  },
  quizzesTab: {
    gap: spacing.md,
  },
  tabLink: {
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  tabList: {
    gap: spacing.xs,
  },
  tabListRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  heading: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  paragraph: {
    fontSize: fontSizes.base,
    lineHeight: lineHeight(fontSizes.base, "relaxed"),
    color: colors.foreground,
  },
  noteRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
  noteBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  noteBadgeText: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imagePlaceholder: {
    height: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 12,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  modalInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
    textAlignVertical: "top",
  },
  noteText: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  actionMenuItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  actionMenuItemText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  modalButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    color: colors.foreground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  modalButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalButtonPrimaryText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  clozeHidden: {
    fontWeight: fontWeights.semibold,
    color: colors.mutedForeground,
  },
  clozeRevealed: {
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  reviewBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reviewBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  reviewGradeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  reviewWarningText: {
    color: colors.warning,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  reviewSuccessText: {
    color: colors.success,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  flashcardsTab: {
    gap: spacing.md,
    alignItems: "center",
  },
  flashcardsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignSelf: "stretch",
  },
  scopeToggle: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  scopeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  scopeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.muted,
  },
  scopeButtonText: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  scopeButtonTextActive: {
    color: colors.foreground,
  },
  scopeBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 1,
    paddingHorizontal: spacing.xs,
  },
  scopeBadgeText: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  flashcard: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.xl,
  },
  flashcardFront: {
    fontSize: fontSizes.lg,
    lineHeight: lineHeight(fontSizes.lg),
    fontWeight: fontWeights.medium,
    color: colors.foreground,
    textAlign: "center",
  },
  flashcardBack: {
    fontSize: fontSizes.sm,
    lineHeight: lineHeight(fontSizes.sm),
    color: colors.foreground,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    alignSelf: "stretch",
  },
  gradeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  gradeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cardForm: {
    alignSelf: "stretch",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
  },
  formLabel: {
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  formInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  formInputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryButton: {
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: colors.foreground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  linkText: {
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  errorText: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
  myCardsSection: {
    alignSelf: "stretch",
    gap: spacing.xs,
  },
  myCardsHeading: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  myCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  myCardRowSuspended: {
    opacity: 0.6,
  },
  myCardText: {
    flexShrink: 1,
  },
  myCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
