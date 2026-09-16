import { fireEvent, render, screen } from "@testing-library/react-native";

import type { Stroke } from "@lp/contracts";

import { DrawingCanvas, DrawingThumbnail } from "./notebook-drawing-canvas";

function layoutEvent(width: number, height: number) {
  return { nativeEvent: { layout: { x: 0, y: 0, width, height } } };
}

test("a touch drag produces a stroke with normalized points", () => {
  const onChange = jest.fn();
  render(<DrawingCanvas strokes={[]} onChange={onChange} />);

  const canvas = screen.getByLabelText("Drawing canvas");
  fireEvent(canvas, "layout", layoutEvent(400, 300));

  fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 40, locationY: 30, force: 0.5 } });
  fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 80, locationY: 60, force: 0.6 } });
  fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 120, locationY: 90, force: 0.7 } });
  fireEvent(canvas, "responderRelease", { nativeEvent: { locationX: 120, locationY: 90 } });

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
  const onChange = jest.fn();
  render(<DrawingCanvas strokes={[]} onChange={onChange} />);

  const canvas = screen.getByLabelText("Drawing canvas");
  fireEvent(canvas, "layout", layoutEvent(400, 300));
  fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 10, locationY: 10 } });
  fireEvent(canvas, "responderRelease", { nativeEvent: { locationX: 10, locationY: 10 } });

  expect(onChange).not.toHaveBeenCalled();
});

test("Undo last stroke removes only the most recent stroke", () => {
  const onChange = jest.fn();
  const strokes: Stroke[] = [
    { color: "#000", width: 0.01, points: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }] },
    { color: "#fff", width: 0.01, points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] },
  ];
  render(<DrawingCanvas strokes={strokes} onChange={onChange} />);

  fireEvent.press(screen.getByText("Undo last stroke"));

  expect(onChange).toHaveBeenCalledWith([strokes[0]]);
});

test("Clear removes all strokes", () => {
  const onChange = jest.fn();
  const strokes: Stroke[] = [
    { color: "#000", width: 0.01, points: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }] },
  ];
  render(<DrawingCanvas strokes={strokes} onChange={onChange} />);

  fireEvent.press(screen.getByText("Clear"));

  expect(onChange).toHaveBeenCalledWith([]);
});

test("readOnly hides the toolbar and doesn't attach a touch handler", () => {
  render(<DrawingCanvas strokes={[]} readOnly />);

  expect(screen.queryByText("Clear")).toBeNull();
  expect(screen.queryByText("Undo last stroke")).toBeNull();
  const canvas = screen.getByLabelText("Drawing canvas");
  expect(canvas.props.onResponderGrant).toBeUndefined();
});

test("DrawingThumbnail renders without crashing for multiple strokes", () => {
  const strokes: Stroke[] = [
    { color: "#000", width: 0.01, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }] },
    { color: "#f00", width: 0.02, points: [{ x: 0.2, y: 0.1 }] },
  ];
  render(<DrawingThumbnail strokes={strokes} />);

  expect(screen.getByLabelText("Drawing preview")).toBeTruthy();
});
