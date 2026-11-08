import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { fontSizes, fontWeights, motion, spacing } from "@/lib/theme";
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
  onDismissed,
  footer,
  side,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Side panels only: fired once the panel has animated out and the Modal
   * has unmounted. `onClose` merely *starts* that, so anything that must wait
   * until the drawer is really gone -- navigating away, above all -- belongs
   * here. Pushing a screen while the panel is still dismissing mounts it
   * underneath a modal that is its own native window on iOS, and the stacking
   * between two of those is undefined. */
  onDismissed?: () => void;
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
  // The context rather than `useSafeAreaInsets()`: that hook throws when no
  // provider sits above it, and expo-router supplies one only at the real app
  // root, while the unit tests render these screens directly. Reading the
  // context yields null there instead, and the floor below keeps the header
  // clear of the status bar either way.
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = insets?.top ?? spacing.lg;
  // 85% of the screen, at most 360 -- computed, so it doesn't depend on
  // percentage widths resolving inside a transparent Modal.
  const { width: screenWidth } = useWindowDimensions();
  const panelWidth = Math.min(360, Math.round(screenWidth * 0.85));

  // Modal's own `animationType` only ever slides from the bottom, so a panel
  // entering from the left or right edge has to be animated here instead --
  // this used to be `fade`, which is why the drawers never matched the
  // sliding interaction the rest of the UI implies.
  //
  // The slide runs on entry only, and dismissal stays immediate. Holding the
  // Modal mounted to play an exit animation means the panel's lifecycle hangs
  // off the animation finishing, and nothing here can guarantee that: the
  // completion callback never fires without the native animated module, so a
  // drawer can strand itself on screen. An instant dismiss is a far better
  // failure mode than one that can get stuck.
  // Lazy initial state rather than `useRef(...).current`: the React Compiler
  // (experiments.reactCompiler) forbids touching a ref during render, and the
  // interpolation below reads this value while rendering.
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  // Tracks whether the panel was ever actually open, so the effect can tell
  // "just dismissed" from "closed ever since mount" -- without it every
  // closed drawer fires onDismissed on its first render, which for the
  // contents drawer would mean navigating on arrival.
  const wasVisibleRef = useRef(visible);
  // Held in a ref so a caller passing an inline closure cannot restart the
  // animation on every render.
  const onDismissedRef = useRef(onDismissed);
  // Assigned in an effect, not during render, for the same reason.
  useEffect(() => {
    onDismissedRef.current = onDismissed;
  }, [onDismissed]);

  useEffect(() => {
    if (!side) return;
    if (visible) {
      wasVisibleRef.current = true;
      // Reset first, so reopening slides in again rather than appearing in
      // place at the value the last open left behind.
      progress.setValue(0);
      const slide = Animated.timing(progress, {
        toValue: 1,
        duration: motion.drawerMs,
        // Native-driven: this screen does a lot of work on the JS thread, and
        // the slide should not stutter because of it. Safe here only because
        // nothing hangs off the completion callback -- that callback does not
        // fire when the native animated module is missing, which is why
        // dismissal is driven by `visible` instead.
        useNativeDriver: true,
      });
      slide.start();
      // Stopped on cleanup: an animation still running when the panel closes
      // or the screen unmounts keeps its driver alive for nothing.
      return () => slide.stop();
    }
    if (!wasVisibleRef.current) return;
    wasVisibleRef.current = false;
    // Effects run after commit, so by now React has already rendered the
    // Modal away. That ordering is the whole point: a caller can navigate
    // from here knowing the panel is off screen, instead of pushing a screen
    // underneath a modal that is its own native window on iOS.
    onDismissedRef.current?.();
  }, [visible, side, progress]);

  const panel = (
    <View style={[overlayStyles.container, overlayStyles.sheet, side && overlayStyles[side]]}>
      {/* The inset is applied inline rather than in the stylesheet: a Modal's
          content sits outside the Stack that pads for insets (app/_layout.tsx
          is the app's only other reader of them), and makeStyles caches per
          colour set so it cannot see this value. The hardcoded padding this
          replaces under-estimated a Dynamic Island and clipped the title and
          the Close control. */}
      <View style={[overlayStyles.header, { paddingTop: topInset + spacing.sm }]}>
        <Text style={overlayStyles.title}>{title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button">
          <Text style={overlayStyles.close}>{t("common.close")}</Text>
        </Pressable>
      </View>
      {/* `flex: 1` belongs on the ScrollView's own style, not only on
          contentContainerStyle: the latter sizes the inner content box and
          leaves the scroll view's own frame to be derived from its content,
          so a list longer than the panel overflows it and can never be
          scrolled to the end. learn/notebook/index.tsx gets this right, which
          is why the notebook scrolls there but not in this drawer. */}
      <ScrollView style={overlayStyles.scroll} contentContainerStyle={overlayStyles.content}>
        {children}
      </ScrollView>
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

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [side === "right" ? panelWidth : -panelWidth, 0],
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[overlayStyles.scrimRow, side === "right" && overlayStyles.scrimRowRight]}>
        <Animated.View
          style={[
            overlayStyles.sidePanel,
            { width: panelWidth, flexBasis: panelWidth, transform: [{ translateX }] },
          ]}
        >
          {panel}
        </Animated.View>
        <Animated.View style={[overlayStyles.scrim, { opacity: progress }]}>
          <Pressable
            style={overlayStyles.scrimFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.closeNamed", { name: title.toLowerCase() })}
          />
        </Animated.View>
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
  scrimFill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
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
  scroll: {
    flex: 1,
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
