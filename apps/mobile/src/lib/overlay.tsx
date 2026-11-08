import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

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
  side,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Pinned below the scroll area, for actions that must stay reachable. */
  footer?: ReactNode;
  /** A panel sliding over the page from that edge instead of a full sheet:
   * the lesson's contents drawer (left) and notebook panel (right),
   * design.md §6-7. Tapping the dimmed page beside it closes it. */
  side?: "left" | "right";
  children: ReactNode;
}) {
  const { t } = useI18n();
  const overlayStyles = useOverlayStyles();
  // 85% of the screen, at most 360 -- computed, so it doesn't depend on
  // percentage widths resolving inside a transparent Modal.
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = Math.min(360, Math.round(screenWidth * 0.85));
  const panel = (
    <View
      style={[
        overlayStyles.container,
        side ? overlayStyles.sidePanel : overlayStyles.sheet,
        side && overlayStyles[side],
        side && { width: panelWidth, flexBasis: panelWidth },
      ]}
    >
      <View style={overlayStyles.header}>
        <Text style={overlayStyles.title}>{title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={overlayStyles.close}>{t("common.close")}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={overlayStyles.content}>{children}</ScrollView>
      {footer !== undefined && <View style={overlayStyles.footer}>{footer}</View>}
    </View>
  );
  // onRequestClose is what makes the Android back button dismiss it; without
  // it the sheet is a trap on that platform.
  if (!side) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        {panel}
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[overlayStyles.scrimRow, side === "right" && overlayStyles.scrimRowRight]}>
        {panel}
        <Pressable
          style={overlayStyles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.closeNamed", { name: title.toLowerCase() })}
        />
      </View>
    </Modal>
  );
}

export const useOverlayStyles = makeStyles((colors) => ({
  container: {
    backgroundColor: colors.background,
  },
  sheet: {
    flex: 1,
  },
  // No `flex` on the side panel at all, and the basis given in pixels next
  // to the width: Yoga resolves a `flex: 1` with `flexBasis: "auto"` to a
  // basis of 0 on native, and react-native-web turns `flex: 0` into 0% --
  // either way the panel collapses and only the dimmed page shows.
  sidePanel: {
    flexGrow: 0,
    flexShrink: 0,
    height: "100%",
  },
  left: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  right: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  scrimRow: {
    flex: 1,
    flexDirection: "row",
  },
  scrimRowRight: {
    flexDirection: "row-reverse",
  },
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 42,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  close: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
}));
