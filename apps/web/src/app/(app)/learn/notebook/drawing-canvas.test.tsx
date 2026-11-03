import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Stroke } from "@lp/contracts";

import { DrawingCanvas, DrawingThumbnail } from "./drawing-canvas";

// jsdom's getBoundingClientRect always returns zeros — stub it with a fixed
// box so pointer coordinates normalize to something other than {x:0, y:0}.
function stubCanvasRect() {
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 400,
    height: 300,
    left: 0,
    top: 0,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON() {},
  });
}

describe("DrawingCanvas", () => {
  test("a pointer drag produces a stroke with normalized points", () => {
    stubCanvasRect();
    const onChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onChange={onChange} />);

    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30, pressure: 0.5 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 60, pressure: 0.6 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 90, pressure: 0.7 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 90 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [strokes] = onChange.mock.calls[0] as [Stroke[]];
    expect(strokes).toHaveLength(1);
    const stroke = strokes[0]!;
    expect(stroke.points).toHaveLength(3);
    expect(stroke.points[0]).toEqual({ x: 0.1, y: 0.1, pressure: 0.5 });
    expect(stroke.points[2]).toEqual({ x: 0.3, y: 0.3, pressure: 0.7 });
    expect(typeof stroke.color).toBe("string");
    expect(stroke.width).toBeGreaterThan(0);
  });

  test("does not emit a stroke for a single tap with no drag", () => {
    stubCanvasRect();
    const onChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onChange={onChange} />);

    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10 });

    expect(onChange).not.toHaveBeenCalled();
  });

  test("Undo has nothing to undo until a stroke or erase happens in this session", () => {
    const onChange = vi.fn();
    const strokes: Stroke[] = [
      {
        color: "#000",
        width: 0.01,
        points: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0.1 },
        ],
      },
    ];
    render(<DrawingCanvas strokes={strokes} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("Undo reverts the most recently drawn stroke", () => {
    stubCanvasRect();
    const onChange = vi.fn();
    const existing: Stroke[] = [
      {
        color: "#000",
        width: 0.01,
        points: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0.1 },
        ],
      },
    ];
    render(<DrawingCanvas strokes={existing} onChange={onChange} />);

    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 60 });
    fireEvent.pointerUp(canvas, { clientX: 80, clientY: 60 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [afterDraw] = onChange.mock.calls[0] as [Stroke[]];
    expect(afterDraw).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]![0]).toEqual(existing);
  });

  test("changing pageKey drops undo history so Undo can't resurrect another page's ink", () => {
    stubCanvasRect();
    const onChange = vi.fn();
    const pageOneInk: Stroke[] = [
      {
        color: "#000",
        width: 0.01,
        points: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0.1 },
        ],
      },
    ];
    const { rerender } = render(
      <DrawingCanvas strokes={pageOneInk} onChange={onChange} pageKey={1} />,
    );

    // Draw on page 1, which pushes page 1's prior ink onto the undo stack.
    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 60 });
    fireEvent.pointerUp(canvas, { clientX: 80, clientY: 60 });
    expect(onChange).toHaveBeenCalledTimes(1);

    // Turn to page 2, which has no ink of its own.
    rerender(<DrawingCanvas strokes={[]} onChange={onChange} pageKey={2} />);

    // Undo must be inert here. Before pageKey existed it stayed enabled and
    // fired onChange with page 1's strokes, which the parent then saved to
    // page 2 -- silently copying one page's ink onto another.
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toBeDisabled();
    fireEvent.click(undo);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("changing pageKey keeps the selected pen colour and tool", () => {
    stubCanvasRect();
    const { rerender } = render(<DrawingCanvas strokes={[]} onChange={vi.fn()} pageKey={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
    fireEvent.click(screen.getByRole("button", { name: "Pen color — blue" }));

    rerender(<DrawingCanvas strokes={[]} onChange={vi.fn()} pageKey={2} />);

    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pen color — blue" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the eraser tool removes points near the drag path, splitting the stroke", () => {
    stubCanvasRect();
    const onChange = vi.fn();
    const strokes: Stroke[] = [
      {
        color: "#000",
        width: 0.01,
        points: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
          { x: 0.9, y: 0.9 },
          { x: 1, y: 1 },
        ],
      },
    ];
    render(<DrawingCanvas strokes={strokes} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    // 0.5/0.5 normalizes to clientX/clientY 200/150 against the 400x300 stub.
    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 150 });
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 150 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [result] = onChange.mock.calls[0] as [Stroke[]];
    // The middle point is erased, splitting the run into two 2-point strokes.
    expect(result).toHaveLength(2);
    expect(result[0]!.points).toEqual([
      { x: 0, y: 0 },
      { x: 0.1, y: 0.1 },
    ]);
    expect(result[1]!.points).toEqual([
      { x: 0.9, y: 0.9 },
      { x: 1, y: 1 },
    ]);
  });

  test("an explicit width/height sizes the canvas instead of the fixed aspect ratio", () => {
    const onChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onChange={onChange} width={600} height={800} />);

    const canvas = screen.getByRole("img", { name: "Drawing canvas" }) as HTMLCanvasElement;
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(800);
  });

  test("Clear removes all strokes", () => {
    const onChange = vi.fn();
    const strokes: Stroke[] = [
      {
        color: "#000",
        width: 0.01,
        points: [
          { x: 0, y: 0 },
          { x: 0.1, y: 0.1 },
        ],
      },
    ];
    render(<DrawingCanvas strokes={strokes} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  test("readOnly hides the toolbar and ignores pointer events", () => {
    stubCanvasRect();
    const onChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onChange={onChange} readOnly />);

    expect(screen.queryByRole("toolbar", { name: "Drawing tools" })).not.toBeInTheDocument();

    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50 });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("DrawingThumbnail", () => {
  test("renders one polyline per stroke", () => {
    const strokes: Stroke[] = [
      {
        color: "#000",
        width: 0.01,
        points: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.5 },
        ],
      },
      { color: "#f00", width: 0.02, points: [{ x: 0.2, y: 0.1 }] },
    ];
    const { container } = render(<DrawingThumbnail strokes={strokes} />);

    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });
});
