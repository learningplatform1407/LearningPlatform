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

  test("Undo last stroke removes only the most recent stroke", () => {
    const onChange = vi.fn();
    const strokes: Stroke[] = [
      { color: "#000", width: 0.01, points: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }] },
      { color: "#fff", width: 0.01, points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] },
    ];
    render(<DrawingCanvas strokes={strokes} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last stroke" }));

    expect(onChange).toHaveBeenCalledWith([strokes[0]]);
  });

  test("Clear removes all strokes", () => {
    const onChange = vi.fn();
    const strokes: Stroke[] = [
      { color: "#000", width: 0.01, points: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }] },
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
      { color: "#000", width: 0.01, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }] },
      { color: "#f00", width: 0.02, points: [{ x: 0.2, y: 0.1 }] },
    ];
    const { container } = render(<DrawingThumbnail strokes={strokes} />);

    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });
});
