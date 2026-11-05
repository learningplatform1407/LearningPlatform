import { Pressable, Text, View, type PressableProps, type ViewStyle } from "react-native";

import { fontSizes, fontWeights, shadows, spacing } from "@/lib/theme";
import { makeStyles } from "@/lib/theme-context";

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
