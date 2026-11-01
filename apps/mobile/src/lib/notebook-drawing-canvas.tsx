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

// Normalized [0,1] hit radius for the eraser -- a touch point within this
// distance of an existing stroke point removes it. Matches the web
// DrawingCanvas's ERASER_RADIUS so the two feel the same.
const ERASER_RADIUS = 0.02;

function strokePath(stroke: Stroke, width: number, height: number): string {
  return stroke.points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x * width},${point.y * height}`)
    .join(" ");
}

// Removes every point within `radius` of `point` from every stroke, then
// splits each stroke's remaining points into separate strokes wherever a
// removal broke a run -- erasing the middle of a stroke yields two shorter
// strokes rather than one that jumps across the gap. A run of fewer than 2
// points is dropped (a single point can't render a line).
function eraseStrokesAtPoint(strokes: Stroke[], point: StrokePoint, radius: number): Stroke[] {
  const result: Stroke[] = [];
  for (const stroke of strokes) {
    let run: StrokePoint[] = [];
    for (const p of stroke.points) {
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      const hit = dx * dx + dy * dy <= radius * radius;
      if (hit) {
        if (run.length >= 2) result.push({ ...stroke, points: run });
        run = [];
      } else {
        run.push(p);
      }
    }
    if (run.length >= 2) result.push({ ...stroke, points: run });
  }
  return result;
}

interface DrawingCanvasProps {
  strokes: Stroke[];
  onChange?: (strokes: Stroke[]) => void;
  readOnly?: boolean;
  /** Explicit pixel size, set by a parent that owns zoom (e.g. a PDF page
   * rendered at a live scale) so the overlay always matches the rendered
   * content exactly. When omitted, falls back to the fixed-aspect-ratio
   * onLayout sizing the standalone notebook drawing box uses. */
  width?: number;
  height?: number;
}

export function DrawingCanvas({
  strokes,
  onChange,
  readOnly = false,
  width,
  height,
}: DrawingCanvasProps) {
  const explicitSize = width !== undefined && height !== undefined;
  const [autoSize, setAutoSize] = useState({ width: 0, height: 0 });
  const size = explicitSize ? { width, height } : autoSize;
  const [color, setColor] = useState<string>(NOTEBOOK_PEN_COLORS[0].hex);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [drawingStroke, setDrawingStroke] = useState<StrokePoint[] | null>(null);
  const [erasingPreview, setErasingPreview] = useState<Stroke[] | null>(null);
  const [eraseBase, setEraseBase] = useState<Stroke[] | null>(null);
  // A stack of full Stroke[] snapshots, one per completed draw or erase, so
  // both are undoable step by step -- not just "pop the last whole stroke".
  const [history, setHistory] = useState<Stroke[][]>([]);

  function handleLayout(event: LayoutChangeEvent) {
    if (explicitSize) return;
    const { width: w } = event.nativeEvent.layout;
    setAutoSize({ width: w, height: w / NOTEBOOK_CANVAS_ASPECT_RATIO });
  }

  function pointFromEvent(event: GestureResponderEvent): StrokePoint {
    const { locationX, locationY, force } = event.nativeEvent;
    return {
      x: size.width > 0 ? Math.min(1, Math.max(0, locationX / size.width)) : 0,
      y: size.height > 0 ? Math.min(1, Math.max(0, locationY / size.height)) : 0,
      pressure: force || undefined,
    };
  }

  function commitChange(previous: Stroke[], next: Stroke[]) {
    setHistory((h) => [...h, previous]);
    onChange?.(next);
  }

  function handleUndo() {
    if (history.length === 0) return;
    const previous = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    onChange?.(previous);
  }

  function handleClear() {
    if (strokes.length === 0) return;
    commitChange(strokes, []);
  }

  // Wired directly to the low-level Responder System props (rather than via
  // PanResponder.create) since we only need each touch's raw location/force,
  // not PanResponder's derived gesture state (dx/dy/velocity) — which is the
  // only thing its wrapper needs real native touch-history bookkeeping for.
  // The in-progress stroke lives in `drawingStroke` state rather than a ref —
  // every move already triggers a re-render for live feedback, so state adds
  // no extra re-renders here.
  function handleResponderGrant(event: GestureResponderEvent) {
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      setEraseBase(strokes);
      setErasingPreview(eraseStrokesAtPoint(strokes, point, ERASER_RADIUS));
      return;
    }
    setDrawingStroke([point]);
  }

  function handleResponderMove(event: GestureResponderEvent) {
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      setErasingPreview((prev) => (prev ? eraseStrokesAtPoint(prev, point, ERASER_RADIUS) : prev));
      return;
    }
    setDrawingStroke((prev) => (prev ? [...prev, point] : [point]));
  }

  function handleResponderRelease() {
    if (tool === "eraser") {
      const base = eraseBase;
      const result = erasingPreview;
      setEraseBase(null);
      setErasingPreview(null);
      if (base && result && JSON.stringify(base) !== JSON.stringify(result)) {
        commitChange(base, result);
      }
      return;
    }
    const points = drawingStroke ?? [];
    setDrawingStroke(null);
    if (points.length < 2) return;
    commitChange(strokes, [...strokes, { color, width: STROKE_WIDTH, points }]);
  }

  function handleResponderTerminate() {
    setDrawingStroke(null);
    setEraseBase(null);
    setErasingPreview(null);
  }

  const displayStrokes = erasingPreview ?? strokes;

  return (
    <View style={explicitSize ? styles.containerOverlay : styles.container}>
      {!readOnly && (
        <View
          style={[styles.toolbar, explicitSize && styles.toolbarOverlay]}
          accessibilityRole="toolbar"
        >
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
            onPress={() => setTool("pen")}
            accessibilityRole="button"
            accessibilityState={{ selected: tool === "pen" }}
            style={[styles.toolButton, tool === "pen" && styles.toolButtonActive]}
          >
            <Text style={styles.toolButtonText}>Pen</Text>
          </Pressable>
          <Pressable
            onPress={() => setTool("eraser")}
            accessibilityRole="button"
            accessibilityState={{ selected: tool === "eraser" }}
            style={[styles.toolButton, tool === "eraser" && styles.toolButtonActive]}
          >
            <Text style={styles.toolButtonText}>Eraser</Text>
          </Pressable>
          <Pressable
            onPress={handleUndo}
            disabled={history.length === 0}
            accessibilityRole="button"
            style={[styles.toolButton, history.length === 0 && styles.toolButtonDisabled]}
          >
            <Text style={styles.toolButtonText}>Undo</Text>
          </Pressable>
          <Pressable
            onPress={handleClear}
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
        style={explicitSize ? [styles.canvasBoxOverlay, { width, height }] : styles.canvasBox}
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
            {displayStrokes.map((stroke, index) => (
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
                d={strokePath(
                  { color, width: STROKE_WIDTH, points: drawingStroke },
                  size.width,
                  size.height,
                )}
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
    <View
      style={styles.thumbnailBox}
      accessibilityRole="image"
      accessibilityLabel="Drawing preview"
    >
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
  // Overlay mode (explicit size, e.g. a PDF page) has no fixed size of its
  // own -- its only sized child is canvasBoxOverlay, and the toolbar is
  // pulled out of flow (position: "absolute") so it floats over the
  // canvas's top-left corner instead of pushing it down and misaligning it
  // with whatever it's drawn on top of.
  containerOverlay: {
    position: "relative",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  toolbarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 10,
    backgroundColor: colors.background,
    opacity: 0.95,
    padding: spacing.xs,
    borderBottomRightRadius: 8,
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
  toolButtonActive: {
    backgroundColor: colors.border,
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
  // Overlay mode must stay fully transparent except for the ink itself --
  // it sits on top of whatever it's drawn over (a PDF page), unlike the
  // notebook's standalone box which needs its own visible background/border.
  canvasBoxOverlay: {
    overflow: "hidden",
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
