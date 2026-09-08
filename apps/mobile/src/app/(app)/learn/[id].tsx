import type { Annotation } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
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
              <Text key={index} style={styles.highlight}>
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

export default function LectureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

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
        <Text style={styles.title}>{data.title}</Text>

        {!version && <Text style={styles.hint}>Not processed yet.</Text>}
        {version?.status === "processing" && <Text style={styles.hint}>Processing...</Text>}
        {version?.status === "failed" && (
          <Text style={styles.error}>Processing failed: {version.error_message ?? "Unknown error"}</Text>
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
              return block.image_path ? <ExtractedImage key={index} path={block.image_path} /> : null;
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
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
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
  highlight: {
    // Matches web's bg-yellow-200 — no shared "highlight" token exists in
    // @lp/ui's closed color set, and this is a fixed v1 color (no picker).
    backgroundColor: "#FEF08A",
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
