import { useRef, useState, type ComponentRef } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type PressableProps,
  type ViewStyle,
} from "react-native";

import { fontSizes, fontWeights, radii, shadows, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { CheckIcon, ChevronDownIcon } from "@/lib/ui/icons";
import { useI18n } from "@/lib/i18n";

/**
 * The quiet-book building blocks, mirroring apps/web/src/components
 * (page-header, dot, segmented-switch, chip). Same names, same shapes, so
 * a screen reads the same on both platforms.
 */

/** A small uppercase kicker naming where you are, then the screen title
 * (design.md §2-3). */
export function ScreenHeader({
  kicker,
  title,
  right,
  children,
}: {
  kicker?: string;
  title: string;
  /** Sits to the right of the title (a settings dot, an action). */
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** The design's small uppercase group label. */
export function LabelCaps({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.labelCaps}>{children}</Text>;
}

/** A 38px round icon button (the design's "dot"). */
export function Dot({
  label,
  pressed,
  style,
  children,
  ...props
}: PressableProps & { label: string; pressed?: boolean; style?: ViewStyle }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={pressed === undefined ? undefined : { selected: pressed }}
      style={[styles.dot, pressed && styles.dotPressed, style]}
      hitSlop={4}
      {...props}
    >
      {children}
    </Pressable>
  );
}

/** A pill of mutually exclusive options (the PDF | Text switch, the theme
 * picker). */
export function SegmentedSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** How far a menu sits from the control it belongs to, the margin it keeps
 * from the bottom of the screen before flipping above it, and the height of
 * one row -- the 44pt tap target every list in this app uses. */
const MENU_GAP = 6;
const MENU_MARGIN = 24;
const MENU_OPTION_HEIGHT = 44;

/**
 * A dropdown: a row showing the current value, opening a menu of the others
 * directly under it.
 *
 * It is a menu pinned to the control, not a sheet. The language picker used
 * to open a full-screen Overlay -- the whole screen, sliding up from the
 * bottom, to choose between two words -- which read as having navigated
 * somewhere rather than having opened a dropdown. The menu is measured
 * against the control (`measureInWindow`) because a Modal's content is its
 * own window and knows nothing of where the control it came from sits, and
 * flips above the control when there is no room below.
 */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const { height: screenHeight } = useWindowDimensions();
  const selected = options.find((option) => option.value === value);
  // Tall enough for every option, so "would the menu fit below?" can be
  // answered before it has been laid out.
  const menuHeight = options.length * MENU_OPTION_HEIGHT + 2 * spacing.xs;
  // Opening and placing are separate: `open` is the press, and the anchor is
  // a best-effort measurement that decides where the menu goes. If it never
  // arrives -- a test renderer has no native view to measure -- the menu
  // still opens, inset from the top of the screen.
  const placement: ViewStyle =
    anchor === null
      ? { top: MENU_MARGIN, left: MENU_MARGIN, right: MENU_MARGIN }
      : {
          left: anchor.x,
          width: anchor.width,
          ...(anchor.y + anchor.height + MENU_GAP + menuHeight < screenHeight - MENU_MARGIN
            ? { top: anchor.y + anchor.height + MENU_GAP }
            : { bottom: screenHeight - anchor.y + MENU_GAP }),
        };

  return (
    <>
      <Pressable
        ref={trigger}
        style={styles.select}
        onPress={() => {
          trigger.current?.measureInWindow((x, y, width, height) =>
            setAnchor({ x, y, width, height }),
          );
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label }}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.selectValue}>{selected?.label}</Text>
        <ChevronDownIcon color={colors.mutedForeground} size={16} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* The page behind it is left alone -- no scrim: a dropdown is not a
            modal interruption, and dimming the screen for one looked like
            the sheet this replaced. Pressing anywhere outside closes it. */}
        <Pressable
          style={styles.menuDismiss}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
        <View style={[styles.menu, placement]}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value}
                style={[styles.menuOption, active && styles.menuOptionActive]}
                onPress={() => {
                  setOpen(false);
                  if (!active) onChange(option.value);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: active }}
              >
                <Text style={styles.menuOptionLabel}>{option.label}</Text>
                {active && <CheckIcon color={colors.accent} size={16} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

/** A static pill: a tag or a count. `active` tints it with the accent, for
 * a count that asks for attention (cards due). */
export function Tag({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.tag, active && styles.tagActive]}>
      <Text style={[styles.tagText, active && styles.tagTextActive]}>{children}</Text>
    </View>
  );
}

/** A pressable filter pill; `selected` gives it the ink outline. */
export function Chip({
  children,
  selected = false,
  ...props
}: PressableProps & { children: React.ReactNode; selected?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
      {...props}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{children}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    paddingTop: 30,
    paddingBottom: 6,
  },
  kicker: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.7,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    flexShrink: 1,
    marginTop: 6,
    marginBottom: 4,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: fontWeights.extrabold,
    color: colors.foreground,
  },
  labelCaps: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  // The closed dropdown: the current value and a chevron.
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  selectValue: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  menuDismiss: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    ...shadows.notch,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    height: MENU_OPTION_HEIGHT,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  menuOptionActive: {
    backgroundColor: colors.muted,
  },
  menuOptionLabel: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  dot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.dot,
  },
  dotPressed: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  switch: {
    flexDirection: "row",
    alignSelf: "flex-start",
    height: 38,
    alignItems: "center",
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    ...shadows.dot,
  },
  segment: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: colors.foreground,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: fontWeights.bold,
    color: colors.mutedForeground,
  },
  segmentTextActive: {
    color: colors.background,
  },
  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagActive: {
    borderColor: "transparent",
    backgroundColor: colors.clozeBg,
  },
  tagText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.mutedForeground,
  },
  tagTextActive: {
    color: colors.accent,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSelected: {
    borderColor: colors.foreground,
  },
  chipText: {
    fontSize: 13,
    fontWeight: fontWeights.bold,
    color: colors.mutedForeground,
  },
  chipTextSelected: {
    color: colors.foreground,
  },
}));
