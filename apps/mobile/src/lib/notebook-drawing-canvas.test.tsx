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

  fireEvent(canvas, "responderGrant", {
    nativeEvent: { locationX: 40, locationY: 30, force: 0.5 },
  });
  fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 80, locationY: 60, force: 0.6 } });
  fireEvent(canvas, "responderMove", {
    nativeEvent: { locationX: 120, locationY: 90, force: 0.7 },
  });
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

test("Undo has nothing to undo until a stroke or erase happens in this session", () => {
  const onChange = jest.fn();
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

  expect(screen.getByRole("button", { name: "Undo" }).props.accessibilityState?.disabled).toBe(
    true,
  );
});

test("Undo reverts the most recently drawn stroke", () => {
  const onChange = jest.fn();
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

  const canvas = screen.getByLabelText("Drawing canvas");
  fireEvent(canvas, "layout", layoutEvent(400, 300));
  fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 40, locationY: 30 } });
  fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 80, locationY: 60 } });
  fireEvent(canvas, "responderRelease", { nativeEvent: { locationX: 80, locationY: 60 } });
  expect(onChange).toHaveBeenCalledTimes(1);
  const [afterDraw] = onChange.mock.calls[0] as [Stroke[]];
  expect(afterDraw).toHaveLength(2);

  fireEvent.press(screen.getByText("Undo"));
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(onChange.mock.calls[1]![0]).toEqual(existing);
});

test("the eraser tool removes points near the drag path, splitting the stroke", () => {
  const onChange = jest.fn();
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

  const canvas = screen.getByLabelText("Drawing canvas");
  fireEvent(canvas, "layout", layoutEvent(400, 300));
  fireEvent.press(screen.getByText("Eraser"));
  // 0.5/0.5 normalizes to locationX/locationY 200/150 against the 400x300 box.
  fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 200, locationY: 150 } });
  fireEvent(canvas, "responderRelease", { nativeEvent: { locationX: 200, locationY: 150 } });

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
  const onChange = jest.fn();
  render(<DrawingCanvas strokes={[]} onChange={onChange} width={600} height={800} />);

  const canvas = screen.getByLabelText("Drawing canvas");
  expect(canvas.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: 600, height: 800 })]),
  );
});

test("Clear removes all strokes", () => {
  const onChange = jest.fn();
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

  fireEvent.press(screen.getByText("Clear"));

  expect(onChange).toHaveBeenCalledWith([]);
});

test("readOnly hides the toolbar and doesn't attach a touch handler", () => {
  render(<DrawingCanvas strokes={[]} readOnly />);

  expect(screen.queryByText("Clear")).toBeNull();
  expect(screen.queryByText("Undo")).toBeNull();
  const canvas = screen.getByLabelText("Drawing canvas");
  expect(canvas.props.onResponderGrant).toBeUndefined();
});

test("DrawingThumbnail renders without crashing for multiple strokes", () => {
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
  render(<DrawingThumbnail strokes={strokes} />);

  expect(screen.getByLabelText("Drawing preview")).toBeTruthy();
});
