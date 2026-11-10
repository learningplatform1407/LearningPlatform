import { Modal, Pressable, Text, View } from "react-native";

import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, lineHeight, radii, shadows, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

/** A short question with two answers, centred over the dimmed page.
 *
 * Replaces `Alert.alert` for confirmations. The native alert is the one piece
 * of this app that looks like neither platform's design language nor ours --
 * it ignores the theme, the type scale and dark mode entirely.
 *
 * Deliberately *not* built on `@/lib/overlay`: that is a full-screen sheet or
 * an edge panel, and filling the screen to ask a yes/no question hides the
 * very thing being decided about. This stays small, so the quiz or the post is
 * still visible behind it.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  /** The consequence, in one sentence. Omit when the title says it all. */
  message?: string;
  confirmLabel: string;
  /** Defaults to the shared "Cancel" wording. */
  cancelLabel?: string;
  /** Tints the confirm action as destructive, for actions that lose work. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const styles = useConfirmStyles();

  return (
    // onRequestClose is the Android back button; without it the dialog is a
    // trap on that platform.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        {/* Behind the card, so tapping beside the dialog dismisses it without
            the card's own presses falling through to it. */}
        <Pressable
          style={styles.scrim}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel ?? t("common.cancel")}
        />
        {/* accessibilityViewIsModal keeps VoiceOver inside the dialog; without
            it the page behind stays reachable by swipe. */}
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {message !== undefined && <Text style={styles.message}>{message}</Text>}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{cancelLabel ?? t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                destructive ? styles.buttonDanger : styles.buttonPrimary,
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, styles.buttonFilledText]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useConfirmStyles = makeStyles((colors) => ({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  // Insets spelled out rather than StyleSheet.absoluteFill: that is a
  // registered style ID in RN 0.88, not an object, so it cannot be spread
  // alongside a background colour.
  scrim: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrim,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  message: {
    fontSize: fontSizes.sm,
    lineHeight: lineHeight(fontSizes.sm, "normal"),
    color: colors.mutedForeground,
  },
  // Right-aligned, so the confirm sits where the thumb already is and the way
  // back is the one you reach for.
  actions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  buttonFilledText: {
    color: colors.primaryForeground,
  },
}));
