import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fontSizes, fontWeights, spacing } from "@/lib/theme";

/** A full-screen sheet, the shape every overlay in this app already has.
 *
 * Extracted from learn/[id].tsx, which had two of these built from private
 * styles. The question of the day would have been the third copy, and a
 * screen-filling modal is exactly the thing that should look the same
 * everywhere -- down to the word on the dismiss control.
 *
 * It dismisses with the word **Close**, not an X. That is deliberate, and not
 * a mismatch with the web overlay's X: all of this app's overlays close this
 * way and the existing tests press them by that word, so a lone X here would
 * be the odd one out on the platform it actually lives on.
 */
export function Overlay({
  visible,
  title,
  onClose,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Pinned below the scroll area, for actions that must stay reachable. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    // onRequestClose is what makes the Android back button dismiss it; without
    // it the sheet is a trap on that platform.
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={overlayStyles.container}>
        <View style={overlayStyles.header}>
          <Text style={overlayStyles.title}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={overlayStyles.close}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={overlayStyles.content}>{children}</ScrollView>
        {footer !== undefined && <View style={overlayStyles.footer}>{footer}</View>}
      </View>
    </Modal>
  );
}

export const overlayStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  close: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.primary,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
});
