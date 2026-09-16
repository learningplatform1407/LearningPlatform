"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { Stroke, StrokePoint } from "@lp/contracts";

// Every stroke's points are normalized to [0, 1] relative to this fixed
// aspect ratio so a drawing looks the same regardless of what size box it's
// rendered into (matches the 4:3 box already used for extracted lesson
// images). Width is likewise a fraction of the canvas width.
export const NOTEBOOK_CANVAS_ASPECT_RATIO = 4 / 3;

export const NOTEBOOK_PEN_COLORS = [
  { name: "black", value: "#1f2937" },
  { name: "yellow", value: "#eab308" },
  { name: "green", value: "#22c55e" },
  { name: "blue", value: "#3b82f6" },
  { name: "pink", value: "#ec4899" },
] as const;

const STROKE_WIDTH = 0.006;

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

interface DrawingCanvasProps {
  strokes: Stroke[];
  onChange?: (strokes: Stroke[]) => void;
  readOnly?: boolean;
}

export function DrawingCanvas({ strokes, onChange, readOnly = false }: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [color, setColor] = useState<string>(NOTEBOOK_PEN_COLORS[0].value);
  const currentStrokeRef = useRef<StrokePoint[]>([]);
  const [drawingStroke, setDrawingStroke] = useState<StrokePoint[] | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setSize({ width, height: width / NOTEBOOK_CANVAS_ASPECT_RATIO });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    for (const stroke of strokes) {
      drawStroke(ctx, stroke, size.width, size.height);
    }
    if (drawingStroke && drawingStroke.length > 0) {
      drawStroke(ctx, { color, width: STROKE_WIDTH, points: drawingStroke }, size.width, size.height);
    }
  }, [strokes, drawingStroke, size, color]);

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
    currentStrokeRef.current = [point];
    setDrawingStroke([point]);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (readOnly || currentStrokeRef.current.length === 0) return;
    const point = pointFromEvent(event);
    currentStrokeRef.current = [...currentStrokeRef.current, point];
    setDrawingStroke(currentStrokeRef.current);
  }

  function handlePointerUp() {
    if (readOnly) return;
    const points = currentStrokeRef.current;
    currentStrokeRef.current = [];
    setDrawingStroke(null);
    if (points.length < 2 || !onChange) return;
    onChange([...strokes, { color, width: STROKE_WIDTH, points }]);
  }

  return (
    <div className="flex flex-col gap-sm">
      {!readOnly && (
        <div role="toolbar" aria-label="Drawing tools" className="flex items-center gap-xs">
          {NOTEBOOK_PEN_COLORS.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              aria-label={`Pen color — ${swatch.name}`}
              aria-pressed={color === swatch.value}
              onClick={() => setColor(swatch.value)}
              style={{ backgroundColor: swatch.value }}
              className={`h-6 w-6 rounded-full border border-border ${
                color === swatch.value ? "ring-2 ring-primary ring-offset-1" : ""
              }`}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange?.(strokes.slice(0, -1))}
            disabled={strokes.length === 0}
            className="ml-md rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            Undo last stroke
          </button>
          <button
            type="button"
            onClick={() => onChange?.([])}
            disabled={strokes.length === 0}
            className="rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        style={{ aspectRatio: NOTEBOOK_CANVAS_ASPECT_RATIO }}
        className="w-full overflow-hidden rounded-md border border-border bg-background"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-full w-full touch-none"
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
      className="w-full rounded-sm border border-border bg-background"
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
