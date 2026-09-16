import type { Stroke, StrokePoint } from "@lp/contracts";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Path, Polyline } from "react-native-svg";

import { colors, spacing } from "@/lib/theme";

// Every stroke's points are normalized to [0, 1] relative to this fixed
// aspect ratio so a drawing looks the same regardless of what size box it's
// rendered into — matches the same 4:3 box the web DrawingCanvas uses and
// the aspectRatio already used for extracted lesson images.
export const NOTEBOOK_CANVAS_ASPECT_RATIO = 4 / 3;

// Deliberately not named `value` — Reanimated's Babel plugin heuristically
// treats a `.value` member access inside a `style` prop as a SharedValue
// read and instruments it accordingly, which both pulls in the real
// worklets runtime (crashing under Jest, which has no native module to back
// it) and just isn't what's happening here.
export const NOTEBOOK_PEN_COLORS = [
  { name: "black", hex: "#1f2937" },
  { name: "yellow", hex: "#eab308" },
  { name: "green", hex: "#22c55e" },
  { name: "blue", hex: "#3b82f6" },
  { name: "pink", hex: "#ec4899" },
] as const;

const STROKE_WIDTH = 0.006;

function strokePath(stroke: Stroke, width: number, height: number): string {
  return stroke.points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x * width},${point.y * height}`)
    .join(" ");
}

interface DrawingCanvasProps {
  strokes: Stroke[];
  onChange?: (strokes: Stroke[]) => void;
  readOnly?: boolean;
}

export function DrawingCanvas({ strokes, onChange, readOnly = false }: DrawingCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [color, setColor] = useState<string>(NOTEBOOK_PEN_COLORS[0].hex);
  const [drawingStroke, setDrawingStroke] = useState<StrokePoint[] | null>(null);

  function handleLayout(event: LayoutChangeEvent) {
    const { width } = event.nativeEvent.layout;
    setSize({ width, height: width / NOTEBOOK_CANVAS_ASPECT_RATIO });
  }

  function pointFromEvent(event: GestureResponderEvent): StrokePoint {
    const { locationX, locationY, force } = event.nativeEvent;
    return {
      x: size.width > 0 ? Math.min(1, Math.max(0, locationX / size.width)) : 0,
      y: size.height > 0 ? Math.min(1, Math.max(0, locationY / size.height)) : 0,
      pressure: force || undefined,
    };
  }

  // Wired directly to the low-level Responder System props (rather than via
  // PanResponder.create) since we only need each touch's raw location/force,
  // not PanResponder's derived gesture state (dx/dy/velocity) — which is the
  // only thing its wrapper needs real native touch-history bookkeeping for.
  // The in-progress stroke lives in `drawingStroke` state rather than a ref —
  // every move already triggers a re-render for live feedback, so state adds
  // no extra re-renders here.
  function handleResponderGrant(event: GestureResponderEvent) {
    setDrawingStroke([pointFromEvent(event)]);
  }

  function handleResponderMove(event: GestureResponderEvent) {
    const point = pointFromEvent(event);
    setDrawingStroke((prev) => (prev ? [...prev, point] : [point]));
  }

  function handleResponderRelease() {
    const points = drawingStroke ?? [];
    setDrawingStroke(null);
    if (points.length < 2) return;
    onChange?.([...strokes, { color, width: STROKE_WIDTH, points }]);
  }

  function handleResponderTerminate() {
    setDrawingStroke(null);
  }

  return (
    <View style={styles.container}>
      {!readOnly && (
        <View style={styles.toolbar} accessibilityRole="toolbar">
          {NOTEBOOK_PEN_COLORS.map((swatch) => (
            <Pressable
              key={swatch.name}
              onPress={() => setColor(swatch.hex)}
              accessibilityRole="button"
              accessibilityLabel={`Pen color — ${swatch.name}`}
              accessibilityState={{ selected: color === swatch.hex }}
              style={[
                styles.swatch,
                { backgroundColor: swatch.hex },
                color === swatch.hex && styles.swatchActive,
              ]}
            />
          ))}
          <Pressable
            onPress={() => onChange?.(strokes.slice(0, -1))}
            disabled={strokes.length === 0}
            accessibilityRole="button"
            style={[styles.toolButton, strokes.length === 0 && styles.toolButtonDisabled]}
          >
            <Text style={styles.toolButtonText}>Undo last stroke</Text>
          </Pressable>
          <Pressable
            onPress={() => onChange?.([])}
            disabled={strokes.length === 0}
            accessibilityRole="button"
            style={[styles.toolButton, strokes.length === 0 && styles.toolButtonDisabled]}
          >
            <Text style={styles.toolButtonText}>Clear</Text>
          </Pressable>
        </View>
      )}
      <View
        onLayout={handleLayout}
        style={styles.canvasBox}
        accessibilityRole="image"
        accessibilityLabel="Drawing canvas"
        {...(readOnly
          ? {}
          : {
              onStartShouldSetResponder: () => true,
              onMoveShouldSetResponder: () => true,
              onResponderGrant: handleResponderGrant,
              onResponderMove: handleResponderMove,
              onResponderRelease: handleResponderRelease,
              onResponderTerminate: handleResponderTerminate,
            })}
      >
        {size.width > 0 && (
          <Svg width={size.width} height={size.height}>
            {strokes.map((stroke, index) => (
              <Path
                key={index}
                d={strokePath(stroke, size.width, size.height)}
                stroke={stroke.color}
                strokeWidth={Math.max(1, stroke.width * size.width)}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {drawingStroke && drawingStroke.length > 0 && (
              <Path
                d={strokePath({ color, width: STROKE_WIDTH, points: drawingStroke }, size.width, size.height)}
                stroke={color}
                strokeWidth={Math.max(1, STROKE_WIDTH * size.width)}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </Svg>
        )}
      </View>
    </View>
  );
}

export function DrawingThumbnail({ strokes }: { strokes: Stroke[] }) {
  return (
    <View style={styles.thumbnailBox} accessibilityRole="image" accessibilityLabel="Drawing preview">
      <Svg viewBox="0 0 1 1" preserveAspectRatio="none" width="100%" height="100%">
        {strokes.map((stroke, index) => (
          <Polyline
            key={index}
            points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={stroke.color}
            strokeWidth={Math.max(0.004, stroke.width)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  swatch: {
    height: 28,
    width: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: colors.primary,
  },
  toolButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  toolButtonDisabled: {
    opacity: 0.5,
  },
  toolButtonText: {
    fontSize: 12,
    color: colors.foreground,
  },
  canvasBox: {
    width: "100%",
    aspectRatio: NOTEBOOK_CANVAS_ASPECT_RATIO,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  thumbnailBox: {
    width: "100%",
    aspectRatio: NOTEBOOK_CANVAS_ASPECT_RATIO,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
});
