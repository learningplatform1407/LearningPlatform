import type { NotebookEntry, Stroke } from "@lp/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ComponentRef, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";

import { DrawingCanvas, DrawingThumbnail } from "./notebook-drawing-canvas";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

// Shared between the Notebook list screen and the lesson reader's Notes
// modal — notes live in one common pool (`notebook_entries`), not linked to
// any lesson, so both surfaces browse/edit the exact same data with the
// exact same components.

/** A text note's first non-blank line, or "" when it has none. */
export function firstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0);
  return line?.trim() ?? "";
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
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {entries.length === 0 && <Text style={styles.hint}>{t("notebook.empty")}</Text>}
      {entries.map((entry) => {
        const active = selectedEntryId === entry.id;
        return (
          <Pressable
            key={entry.id}
            style={({ pressed }) => [styles.row, (active || pressed) && styles.rowActive]}
            onPress={() => onSelect(entry.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {entry.type === "text" ? (
              <Text style={[styles.rowTitle, active && styles.rowTitleActive]} numberOfLines={1}>
                {firstLine(entry.content ?? "") || t("notebook.untitled")}
              </Text>
            ) : (
              <View style={styles.drawingRow}>
                <Text style={[styles.rowTitle, active && styles.rowTitleActive]}>
                  {t("notebook.drawing")}
                </Text>
                <DrawingThumbnail strokes={entry.strokes ?? []} />
              </View>
            )}
          </Pressable>
        );
      })}
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
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.newRow}>
      <Pressable style={styles.newButton} onPress={onNewText} accessibilityRole="button">
        <Text style={styles.newButtonText}>{t("notebook.newText")}</Text>
      </Pressable>
      <Pressable style={styles.newButton} onPress={onNewDrawing} accessibilityRole="button">
        <Text style={styles.newButtonText}>{t("notebook.newDrawing")}</Text>
      </Pressable>
    </View>
  );
}

// One rule per line of text, as in the web notebook and the lesson's
// notebook panel (design.md §7): the body's line height, so the writing sits
// on the rules.
const LINE = 28;

/** Ruled lines drawn behind whatever it wraps, as many as its height holds.
 * React Native has no repeating background, so the rules are views. */
function LinedPaper({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const [height, setHeight] = useState(0);
  const rules = Math.max(0, Math.floor(height / LINE));
  return (
    <View style={styles.paper} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      {Array.from({ length: rules }, (_, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[styles.rule, { top: (index + 1) * LINE - 1 }]}
        />
      ))}
      {children}
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
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const isNew = !entry;
  const resolvedType: "text" | "drawing" = entry?.type ?? type;

  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [strokesDraft, setStrokesDraft] = useState<Stroke[] | null>(null);
  const [saved, setSaved] = useState(false);

  const textValue = textDraft ?? entry?.content ?? "";
  const strokesValue = strokesDraft ?? entry?.strokes ?? [];
  const canSave = resolvedType === "text" ? textValue.trim().length > 0 : strokesValue.length > 0;
  const bodyInputRef = useRef<ComponentRef<typeof TextInput>>(null);

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
            accessibilityLabel={t("notebook.noteTitle")}
            style={styles.titleInput}
            value={titleValue}
            onChangeText={setTitle}
            placeholder={t("notebook.noteTitle")}
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
            onSubmitEditing={() => bodyInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <LinedPaper>
            <TextInput
              ref={bodyInputRef}
              accessibilityLabel={t("notebook.noteBody")}
              style={styles.bodyInput}
              value={bodyValue}
              onChangeText={setBody}
              placeholder={t("notebook.placeholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              scrollEnabled={false}
            />
          </LinedPaper>
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
            <Text style={styles.buttonPrimaryText}>{t("common.save")}</Text>
          )}
        </Pressable>
        {!isNew && (
          <Pressable
            style={[styles.button, styles.buttonDanger]}
            onPress={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            accessibilityRole="button"
          >
            <Text style={styles.buttonDangerText}>{t("common.delete")}</Text>
          </Pressable>
        )}
        {saved && <Text style={styles.hint}>{t("common.saved")}</Text>}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  list: {
    gap: 2,
  },
  // The lesson contents list's rows (design.md §6), as on the web notebook.
  row: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: spacing.xs,
  },
  rowActive: {
    backgroundColor: colors.muted,
  },
  rowTitle: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  rowTitleActive: {
    fontWeight: fontWeights.extrabold,
  },
  drawingRow: {
    gap: spacing.xs,
  },
  newRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  newButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.background,
    paddingVertical: 8,
    alignItems: "center",
  },
  newButtonText: {
    fontSize: 13,
    fontWeight: fontWeights.bold,
    color: colors.foreground,
  },
  editor: {
    gap: spacing.md,
  },
  textBox: {
    minHeight: 320,
  },
  titleInput: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    paddingBottom: spacing.xs,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  paper: {
    flex: 1,
    minHeight: LINE * 10,
  },
  rule: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  bodyInput: {
    flex: 1,
    padding: 0,
    fontSize: 17,
    lineHeight: LINE,
    color: colors.foreground,
    textAlignVertical: "top",
    includeFontPadding: false,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  button: {
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonPrimaryText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonDangerText: {
    color: colors.dangerForeground,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
}));
