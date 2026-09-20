import type { NotebookEntry, Stroke } from "@lp/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

import { DrawingCanvas, DrawingThumbnail } from "./notebook-drawing-canvas";

// Shared between the Notebook list screen and the lesson reader's Notes
// modal — notes live in one common pool (`notebook_entries`), not linked to
// any lesson, so both surfaces browse/edit the exact same data with the
// exact same components.

export function firstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.trim() || "Untitled note";
}

export function NotebookEntryList({
  entries,
  selectedEntryId,
  onSelect,
}: {
  entries: NotebookEntry[];
  selectedEntryId?: string;
  onSelect: (entryId: string) => void;
}) {
  return (
    <View style={styles.list}>
      {entries.length === 0 && <Text style={styles.hint}>No notes yet.</Text>}
      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          style={[styles.row, selectedEntryId === entry.id && styles.rowActive]}
          onPress={() => onSelect(entry.id)}
          accessibilityRole="button"
        >
          {entry.type === "text" ? (
            <Text style={styles.rowPreview} numberOfLines={2}>
              {firstLine(entry.content ?? "")}
            </Text>
          ) : (
            <View style={styles.drawingRow}>
              <Text style={styles.rowTitle}>Drawing</Text>
              <DrawingThumbnail strokes={entry.strokes ?? []} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

export function NewEntryButtons({
  onNewText,
  onNewDrawing,
}: {
  onNewText: () => void;
  onNewDrawing: () => void;
}) {
  return (
    <View style={styles.newRow}>
      <Pressable style={styles.newButton} onPress={onNewText} accessibilityRole="button">
        <Text style={styles.newButtonText}>+ Text</Text>
      </Pressable>
      <Pressable style={styles.newButton} onPress={onNewDrawing} accessibilityRole="button">
        <Text style={styles.newButtonText}>+ Drawing</Text>
      </Pressable>
    </View>
  );
}

export function NotebookEntryEditor({
  entry,
  type = "text",
  sourceDocumentId,
  onCreated,
  onDeleted,
}: {
  entry?: NotebookEntry;
  type?: "text" | "drawing";
  sourceDocumentId?: string;
  onCreated?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = !entry;
  const resolvedType: "text" | "drawing" = entry?.type ?? type;

  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [strokesDraft, setStrokesDraft] = useState<Stroke[] | null>(null);
  const [saved, setSaved] = useState(false);

  const textValue = textDraft ?? entry?.content ?? "";
  const strokesValue = strokesDraft ?? entry?.strokes ?? [];
  const canSave = resolvedType === "text" ? textValue.trim().length > 0 : strokesValue.length > 0;
  const bodyInputRef = useRef<TextInput>(null);

  // The note's first line doubles as its title (Apple Notes/Keep-style) —
  // there's no separate title field, so splitting/joining on "\n" is what
  // keeps the title and body editable as two inputs while staying a single
  // `content` string for storage.
  const textLines = textValue.split("\n");
  const titleValue = textLines[0] ?? "";
  const bodyValue = textLines.slice(1).join("\n");

  function setTitle(next: string) {
    setTextDraft([next, ...textLines.slice(1)].join("\n"));
    setSaved(false);
  }

  function setBody(next: string) {
    setTextDraft([titleValue, next].join("\n"));
    setSaved(false);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      resolvedType === "text"
        ? getApiClient().createNotebookEntry({
            type: "text",
            content: textValue,
            source_document_id: sourceDocumentId,
          })
        : getApiClient().createNotebookEntry({
            type: "drawing",
            strokes: strokesValue,
            source_document_id: sourceDocumentId,
          }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      onCreated?.(created.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      getApiClient().updateNotebookEntry(
        entry!.id,
        resolvedType === "text" ? { content: textValue } : { strokes: strokesValue },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      setSaved(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => getApiClient().deleteNotebookEntry(entry!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-entries"] });
      onDeleted?.();
    },
  });

  return (
    <View style={styles.editor}>
      {resolvedType === "text" ? (
        <View style={styles.textBox}>
          <TextInput
            style={styles.titleInput}
            value={titleValue}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
            onSubmitEditing={() => bodyInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TextInput
            ref={bodyInputRef}
            style={styles.bodyInput}
            value={bodyValue}
            onChangeText={setBody}
            placeholder="Write a new note..."
            placeholderTextColor={colors.mutedForeground}
            multiline
          />
        </View>
      ) : (
        <DrawingCanvas
          strokes={strokesValue}
          onChange={(next) => {
            setStrokesDraft(next);
            setSaved(false);
          }}
        />
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.buttonPrimary, !canSave && styles.buttonDisabled]}
          onPress={() => (isNew ? createMutation.mutate() : updateMutation.mutate())}
          disabled={!canSave || createMutation.isPending || updateMutation.isPending}
          accessibilityRole="button"
        >
          {createMutation.isPending || updateMutation.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonPrimaryText}>Save</Text>
          )}
        </Pressable>
        {!isNew && (
          <Pressable
            style={styles.button}
            onPress={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            accessibilityRole="button"
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        )}
        {saved && <Text style={styles.hint}>Saved.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  rowActive: {
    backgroundColor: colors.muted,
    borderColor: colors.primary,
  },
  rowTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  rowPreview: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  drawingRow: {
    gap: spacing.xs,
  },
  newRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  newButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  newButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  editor: {
    gap: spacing.sm,
  },
  textBox: {
    flex: 1,
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  titleInput: {
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  bodyInput: {
    flex: 1,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.foreground,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  button: {
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
  buttonPrimaryText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
});
