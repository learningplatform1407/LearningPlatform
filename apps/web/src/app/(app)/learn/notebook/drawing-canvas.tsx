"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { Stroke, StrokePoint } from "@lp/contracts";
import { HIGHLIGHT_COLOR_NAMES, pageColors } from "@lp/ui";

// Every stroke's points are normalized to [0, 1] relative to this fixed
// aspect ratio so a drawing looks the same regardless of what size box it's
// rendered into (matches the 4:3 box already used for extracted lesson
// images). Width is likewise a fraction of the canvas width.
export const NOTEBOOK_CANVAS_ASPECT_RATIO = 4 / 3;

export const NOTEBOOK_PEN_COLORS = [
  { name: "graphite", value: "#1D1F23" },
  ...HIGHLIGHT_COLOR_NAMES.map((name, i) => ({ name, value: pageColors.pens[i]! })),
];

const STROKE_WIDTH = 0.006;

// Normalized [0,1] hit radius for the eraser -- a drag point within this
// distance of an existing stroke point removes it.
const ERASER_RADIUS = 0.02;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = Math.max(1, stroke.width * width);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
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
   * ResizeObserver sizing the standalone notebook drawing box uses. */
  width?: number;
  height?: number;
  /** Identifies which surface is being drawn on, for parents that reuse one
   * canvas across several (e.g. the pages of a PDF). Undo history and any
   * in-flight gesture are scoped to a single surface, so both are discarded
   * when this changes; pen colour and tool are user preferences and
   * survive. Without it, pressing Undo after a page turn pushed the
   * *previous* page's strokes onto the page now showing. */
  pageKey?: string | number;
}

export function DrawingCanvas({
  strokes,
  onChange,
  readOnly = false,
  width,
  height,
  pageKey,
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const explicitSize = width !== undefined && height !== undefined;
  const [autoSize, setAutoSize] = useState({ width: 0, height: 0 });
  const size = explicitSize ? { width, height } : autoSize;
  const [color, setColor] = useState<string>(NOTEBOOK_PEN_COLORS[0]!.value);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const currentStrokeRef = useRef<StrokePoint[]>([]);
  const [drawingStroke, setDrawingStroke] = useState<StrokePoint[] | null>(null);
  const eraseBaseRef = useRef<Stroke[] | null>(null);
  const eraseWorkingRef = useRef<Stroke[] | null>(null);
  const [erasingPreview, setErasingPreview] = useState<Stroke[] | null>(null);
  // A stack of full Stroke[] snapshots, one per completed draw or erase, so
  // both are undoable step by step -- not just "pop the last whole stroke".
  const [history, setHistory] = useState<Stroke[][]>([]);

  // Discard surface-scoped state the moment `pageKey` changes, rather than
  // in an effect: an effect runs *after* the render that already showed the
  // new page, leaving one frame in which Undo would apply the old page's
  // history to it. Setting state during render is the supported way to
  // adjust state on a prop change, as long as it's guarded like this.
  // The gesture refs are deliberately not touched here: refs must not be
  // written during render, and they don't need to be. Every gesture seeds
  // them on pointerdown and clears them on pointerup/pointerleave, and the
  // canvas holds pointer capture in between, so a page can't change
  // mid-gesture and leave a stale one behind.
  const [trackedPageKey, setTrackedPageKey] = useState(pageKey);
  if (pageKey !== trackedPageKey) {
    setTrackedPageKey(pageKey);
    setHistory([]);
    setDrawingStroke(null);
    setErasingPreview(null);
  }

  useEffect(() => {
    if (explicitSize) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setAutoSize({ width: w, height: w / NOTEBOOK_CANVAS_ASPECT_RATIO });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [explicitSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    const displayStrokes = erasingPreview ?? strokes;
    for (const stroke of displayStrokes) {
      drawStroke(ctx, stroke, size.width, size.height);
    }
    if (drawingStroke && drawingStroke.length > 0) {
      drawStroke(
        ctx,
        { color, width: STROKE_WIDTH, points: drawingStroke },
        size.width,
        size.height,
      );
    }
  }, [strokes, drawingStroke, erasingPreview, size.width, size.height, color]);

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

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): StrokePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      pressure: event.pressure || undefined,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    // jsdom doesn't implement the Pointer Capture API — guard so tests can
    // fire pointer events without a real browser.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      eraseBaseRef.current = strokes;
      const next = eraseStrokesAtPoint(strokes, point, ERASER_RADIUS);
      eraseWorkingRef.current = next;
      setErasingPreview(next);
      return;
    }
    currentStrokeRef.current = [point];
    setDrawingStroke([point]);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      if (!eraseWorkingRef.current) return;
      const next = eraseStrokesAtPoint(eraseWorkingRef.current, point, ERASER_RADIUS);
      eraseWorkingRef.current = next;
      setErasingPreview(next);
      return;
    }
    if (currentStrokeRef.current.length === 0) return;
    currentStrokeRef.current = [...currentStrokeRef.current, point];
    setDrawingStroke(currentStrokeRef.current);
  }

  function handlePointerUp() {
    if (readOnly) return;
    if (tool === "eraser") {
      const base = eraseBaseRef.current;
      const result = eraseWorkingRef.current;
      eraseBaseRef.current = null;
      eraseWorkingRef.current = null;
      setErasingPreview(null);
      if (base && result && JSON.stringify(base) !== JSON.stringify(result)) {
        commitChange(base, result);
      }
      return;
    }
    const points = currentStrokeRef.current;
    currentStrokeRef.current = [];
    setDrawingStroke(null);
    if (points.length < 2) return;
    commitChange(strokes, [...strokes, { color, width: STROKE_WIDTH, points }]);
  }

  return (
    <div className={explicitSize ? "relative" : "flex flex-col gap-sm"}>
      {!readOnly && (
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className={`flex items-center gap-xs ${
            // Overlay mode (explicit size, e.g. a PDF page) floats the
            // toolbar over the top-left corner of the canvas instead of
            // stacking it above -- stacking would push the canvas down by
            // the toolbar's height and throw it out of alignment with
            // whatever it's drawn on top of.
            explicitSize
              ? "absolute left-0 top-0 z-10 rounded-br-md bg-background/90 p-xs shadow-sm"
              : ""
          }`}
        >
          {NOTEBOOK_PEN_COLORS.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              aria-label={`Pen color — ${swatch.name}`}
              aria-pressed={color === swatch.value}
              onClick={() => setColor(swatch.value)}
              style={{ backgroundColor: swatch.value }}
              className={`h-6 w-6 rounded-full border border-border ${
                color === swatch.value
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : ""
              }`}
            />
          ))}
          <div role="group" aria-label="Tool" className="ml-md flex items-center gap-xs">
            <button
              type="button"
              aria-pressed={tool === "pen"}
              onClick={() => setTool("pen")}
              className="rounded-full border border-border bg-background px-3 py-1 text-caption font-bold text-foreground hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              Pen
            </button>
            <button
              type="button"
              aria-pressed={tool === "eraser"}
              onClick={() => setTool("eraser")}
              className="rounded-full border border-border bg-background px-3 py-1 text-caption font-bold text-foreground hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              Eraser
            </button>
          </div>
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="ml-md rounded-full border border-border bg-background px-3 py-1 text-caption font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={strokes.length === 0}
            className="rounded-full border border-border bg-background px-3 py-1 text-caption font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        style={explicitSize ? { width, height } : { aspectRatio: NOTEBOOK_CANVAS_ASPECT_RATIO }}
        className={
          // Overlay mode must stay fully transparent except for the ink
          // itself -- it sits on top of whatever it's drawn over (a PDF
          // page), unlike the notebook's standalone box which needs its
          // own visible background/border.
          explicitSize
            ? "overflow-hidden"
            : "w-full overflow-hidden rounded-lg bg-paper shadow-page"
        }
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`h-full w-full touch-none ${tool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
          role="img"
          aria-label="Drawing canvas"
        />
      </div>
    </div>
  );
}

export function DrawingThumbnail({ strokes }: { strokes: Stroke[] }) {
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ aspectRatio: NOTEBOOK_CANVAS_ASPECT_RATIO }}
      className="w-full rounded-sm bg-paper shadow-page"
      role="img"
      aria-label="Drawing preview"
    >
      {strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={stroke.color}
          strokeWidth={Math.max(0.004, stroke.width)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
