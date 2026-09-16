import type { Annotation, AnnotationCreateRequest } from "@lp/contracts";
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
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";
import { spliceAnnotations } from "@/lib/text-offset";

function ExtractedImage({ path }: { path: string }) {
  const { data: url, isPending, isError } = useQuery({
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
            onPress={() =>
              onToolChange(isActive ? null : { type: "highlight", color: color.name })
            }
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
  const { data, isPending } = useQuery({
    queryKey: ["quizzes", documentId],
    queryFn: () => getApiClient().listQuizzes(documentId),
  });

  if (isPending) {
    return <Text style={styles.hint}>Loading...</Text>;
  }
  if (!data || data.length === 0) {
    return <Text style={styles.hint}>Coming soon.</Text>;
  }
  return (
    <View style={styles.tabList}>
      {data.map((quiz) => (
        <View key={quiz.id} style={styles.tabListRow}>
          <Text style={styles.rowTitle}>{quiz.title}</Text>
        </View>
      ))}
    </View>
  );
}

function FlashcardsTab({ documentId }: { documentId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["flashcards", documentId],
    queryFn: () => getApiClient().listFlashcards(documentId),
  });

  if (isPending) {
    return <Text style={styles.hint}>Loading...</Text>;
  }
  if (!data || data.length === 0) {
    return <Text style={styles.hint}>Coming soon.</Text>;
  }
  return (
    <View style={styles.tabList}>
      {data.map((flashcard) => (
        <View key={flashcard.id} style={styles.tabListRow}>
          <Text style={styles.rowTitle}>{flashcard.front_text}</Text>
        </View>
      ))}
    </View>
  );
}

export function NotesTab({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const { data: note, isPending } = useQuery({
    queryKey: ["note", documentId],
    queryFn: () => getApiClient().getNote(documentId),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const value = draft ?? note?.content ?? "";

  const saveMutation = useMutation({
    mutationFn: (content: string) => getApiClient().upsertNote(documentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note", documentId] });
      setSaved(true);
    },
  });

  if (isPending) {
    return <Text style={styles.hint}>Loading...</Text>;
  }

  return (
    <View style={styles.notesTab}>
      <TextInput
        style={styles.notesInput}
        value={value}
        onChangeText={(text) => {
          setDraft(text);
          setSaved(false);
        }}
        placeholder="Write your notes for this lesson..."
        multiline
      />
      <View style={styles.notesActions}>
        <Pressable
          style={[styles.modalButton, styles.modalButtonPrimary]}
          onPress={() => saveMutation.mutate(value)}
          disabled={saveMutation.isPending}
          accessibilityRole="button"
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.modalButtonPrimaryText}>Save</Text>
          )}
        </Pressable>
        {saved && <Text style={styles.hint}>Saved.</Text>}
      </View>
    </View>
  );
}

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
                style={[
                  styles.rowTitle,
                  doc.id === currentDocumentId && styles.tocRowActiveText,
                ]}
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
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlayContainer}>
        <View style={styles.overlayHeader}>
          <Text style={styles.overlayTitle}>Notes</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.overlayClose}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.overlayContent}>
          <NotesTab documentId={documentId} />
        </View>
      </View>
    </Modal>
  );
}

export default function LectureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("lesson");
  const [tocOpen, setTocOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);

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

  const [composingBlockIndex, setComposingBlockIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [viewingNote, setViewingNote] = useState<Annotation | null>(null);

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
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
                    onLongPress={() => setComposingBlockIndex(index)}
                    onOpenNote={setViewingNote}
                  />
                );
              })}
          </>
        )}
      </ScrollView>

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
                onPress={() => composingBlockIndex !== null && createNoteMutation.mutate(composingBlockIndex)}
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
              <Pressable onPress={() => setViewingNote(null)} style={styles.modalButton} accessibilityRole="button">
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
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
    flex: 1,
    padding: spacing.xl,
    gap: spacing.xs,
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
  notesTab: {
    gap: spacing.sm,
  },
  notesInput: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
    textAlignVertical: "top",
  },
  notesActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
});
