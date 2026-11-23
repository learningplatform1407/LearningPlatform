import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import {
  lettersOfWords,
  PdfLessonView,
  type PdfTool,
  rectsForWords,
  wordAt,
} from "./pdf-lesson-view";

const mockGetPageInk = jest.fn();
const mockGetPageWords = jest.fn();
const mockUpdatePageInk = jest.fn();

jest.mock("@/lib/api-client", () => ({
  getApiClient: () => ({
    getPageInk: mockGetPageInk,
    getPageWords: mockGetPageWords,
    updatePageInk: mockUpdatePageInk,
  }),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://x/a.pdf" } }),
      }),
    },
  },
}));

// "Hello world" on one line, "Next" on the line below.
const WORDS = [
  { text: "Hello", box: [0.1, 0.1, 0.3, 0.14] as [number, number, number, number], line: 1 },
  { text: "world", box: [0.32, 0.1, 0.5, 0.14] as [number, number, number, number], line: 1 },
  { text: "Next", box: [0.1, 0.2, 0.25, 0.24] as [number, number, number, number], line: 2 },
];

function renderView(tool: PdfTool, margins = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PdfLessonView
        documentId="d1"
        storagePath="lectures/a.pdf"
        pageCount={3}
        tool={tool}
        margins={margins}
        viewportTop={0}
        viewportHeight={800}
      />
    </QueryClientProvider>,
  );
}

/** Lays the column out at `width`, which is what gives the pages a size. */
async function layOutColumn(width = 300) {
  fireEvent(await screen.findByTestId("pdf-column"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 1000 } },
  });
}

beforeEach(() => {
  mockGetPageInk.mockReset().mockResolvedValue({ strokes: [], highlights: [] });
  mockGetPageWords.mockReset().mockResolvedValue({ words: WORDS });
  mockUpdatePageInk
    .mockReset()
    .mockImplementation((_d, _p, body) => Promise.resolve({ highlights: [], ...body }));
});

test("words on one line join into one rectangle, a new line starts another", () => {
  const rects = rectsForWords(WORDS);
  expect(rects).toHaveLength(2);
  expect(rects[0]![0]).toBeCloseTo(0.098);
  expect(rects[0]![2]).toBeCloseTo(0.502);
});

test("a tap between two words picks the nearer one", () => {
  expect(wordAt(WORDS, 0.2, 0.12)).toBe(0);
  expect(wordAt(WORDS, 0.315, 0.12)).toBe(1);
  expect(wordAt(WORDS, 0.9, 0.5)).toBeNull();
});

test("each word splits into letters, by their typical widths, ending where the word does", () => {
  const letters = lettersOfWords(WORDS);
  expect(letters.map((l) => l.text).join("")).toBe("HelloworldNext");
  const hello = letters.slice(0, 5);
  expect(hello[0]!.box[0]).toBeCloseTo(0.1);
  expect(hello[4]!.box[2]).toBeCloseTo(0.3);
  // An "l" is narrower than an "H".
  const width = (box: number[]) => box[2]! - box[0]!;
  expect(width(hello[2]!.box)).toBeLessThan(width(hello[0]!.box));
  // Letters keep their word's line, so a run of them joins per line.
  expect(letters[10]!.line).toBe(2);
});

test("every page is its own card, and only the first renders before it has loaded", async () => {
  renderView(null);
  fireEvent(await screen.findByTestId("pdf-column"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 1000 } },
  });

  expect(screen.getByTestId("pdf-page-1")).toBeTruthy();
  expect(screen.getByTestId("pdf-page-3")).toBeTruthy();
  // Page 1 fills the download cache the others then read from.
  expect(screen.getAllByTestId("mock-pdf")).toHaveLength(1);
});

test("with a marker up, press and hold, then drag, saves a highlight letter by letter", async () => {
  const onMarkingChange = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PdfLessonView
        documentId="d1"
        storagePath="lectures/a.pdf"
        pageCount={3}
        tool={{ type: "highlight", color: "blue" }}
        viewportTop={0}
        viewportHeight={800}
        onMarkingChange={onMarkingChange}
      />
    </QueryClientProvider>,
  );
  fireEvent(await screen.findByTestId("pdf-column"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 1000 } },
  });
  await waitFor(() => expect(mockGetPageWords).toHaveBeenCalledWith("d1", 1));
  // Letters exist once the page's words have arrived.
  await act(() => mockGetPageWords.mock.results[0]!.value);
  const layer = screen.getByTestId("pdf-mark-layer-1");
  // Page 1 is 300 wide and 300 * 1.414 tall.
  const height = 300 * 1.414;
  const from = { x: 0.2 * 300, y: 0.12 * height }; // the "e" of "Hello"
  const to = { x: 0.12 * 300, y: 0.22 * height }; // the "N" of "Next"

  fireEvent(layer, "responderGrant", {
    nativeEvent: { locationX: from.x, locationY: from.y, pageX: from.x, pageY: from.y },
  });
  // The hold, waited on rather than slept through: a busy CI runner can fire
  // the timer late.
  await waitFor(() => expect(onMarkingChange).toHaveBeenLastCalledWith(true));
  expect(screen.getAllByTestId("pdf-mark-preview")).toHaveLength(1);

  fireEvent(layer, "responderMove", { nativeEvent: { pageX: to.x, pageY: to.y } });
  // Across two printed lines: one preview rectangle per line.
  expect(screen.getAllByTestId("pdf-mark-preview")).toHaveLength(2);
  fireEvent(layer, "responderRelease", { nativeEvent: {} });

  expect(onMarkingChange).toHaveBeenLastCalledWith(false);
  await waitFor(() =>
    expect(mockUpdatePageInk).toHaveBeenCalledWith("d1", 1, {
      strokes: [],
      highlights: [{ color: "blue", rects: rectsForWords(lettersOfWords(WORDS).slice(1, 11)) }],
    }),
  );
});

test("a quick swipe on a page is a scroll, not a mark", async () => {
  renderView({ type: "highlight", color: "blue" });
  fireEvent(await screen.findByTestId("pdf-column"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 1000 } },
  });
  await waitFor(() => expect(mockGetPageWords).toHaveBeenCalledWith("d1", 1));
  const layer = await screen.findByTestId("pdf-mark-layer-1");

  fireEvent(layer, "responderGrant", {
    nativeEvent: { locationX: 60, locationY: 50, pageX: 60, pageY: 50 },
  });
  fireEvent(layer, "responderMove", { nativeEvent: { pageX: 60, pageY: 120 } });
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  fireEvent(layer, "responderRelease", { nativeEvent: {} });

  expect(screen.queryByTestId("pdf-mark-preview")).toBeNull();
  expect(mockUpdatePageInk).not.toHaveBeenCalled();
});

describe("writing margins", () => {
  /** The page's own box, and the row holding it and its margins. */
  function widths(page = 1): { page: number; row: number } {
    const flatten = (style: unknown): Record<string, number> =>
      Object.assign({}, ...[style].flat(5).filter(Boolean));
    return {
      page: flatten(screen.getByTestId(`pdf-page-${page}`).props.style).width!,
      row: flatten(screen.getByTestId(`pdf-page-row-${page}`).props.style).width!,
    };
  }

  test("off, a page fills the column exactly as it did before they existed", async () => {
    renderView(null);
    await layOutColumn(300);

    expect(widths()).toEqual({ page: 300, row: 300 });
  });

  test("on, the page shrinks to make room rather than the column growing", async () => {
    renderView(null, true);
    await layOutColumn(300);

    // 18% each side, rounded to whole points, with the page taking the
    // rest -- so the three add up to the column exactly and no page ever
    // overflows it.
    const { page, row } = widths();
    expect(row).toBe(300);
    expect(page).toBe(220); // 300 - 2 * round(300 * 0.18 / 1.36)
    expect(page + 2 * 40).toBe(300);
  });

  test("ink drawn in a margin is stored outside the page, and keeps its width", async () => {
    renderView({ type: "pen", color: "#1D1F23", size: "medium" }, true);
    await layOutColumn(300);

    // One canvas per page; page 1's is the first.
    const canvas = (await screen.findAllByLabelText("Drawing canvas"))[0]!;
    // A short stroke in the left margin: 30pt in from the row's left edge,
    // which is behind the page's own left edge.
    fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 30, locationY: 100 } });
    fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 34, locationY: 140 } });
    fireEvent(canvas, "responderRelease", { nativeEvent: {} });

    await waitFor(() => expect(mockUpdatePageInk).toHaveBeenCalled());
    const [, , body] = mockUpdatePageInk.mock.calls[0]!;
    const stroke = body.strokes[0]!;
    // -0.18 at the row's left edge, 0 at the page's: 30pt in lands between.
    expect(stroke.points[0]!.x).toBeLessThan(0);
    expect(stroke.points[0]!.x).toBeGreaterThan(-0.18);
    // Widths are a fraction of the page, not of the wider row, so ink in a
    // margin is exactly as thick as ink on the page.
    expect(stroke.width).toBeCloseTo(0.006, 4);
  });

  test("ink already on a page is untouched by turning margins on", async () => {
    const stroke = {
      color: "#1D1F23",
      width: 0.006,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.3 },
      ],
    };
    mockGetPageInk.mockResolvedValue({ strokes: [stroke], highlights: [] });

    renderView({ type: "pen", color: "#1D1F23", size: "medium" }, true);
    await layOutColumn(300);

    // Nothing is rewritten on load: the stored points are still the stored
    // points, which is what keeps a mark where it was drawn.
    await waitFor(() => expect(mockGetPageInk).toHaveBeenCalledWith("d1", 1));
    expect(mockUpdatePageInk).not.toHaveBeenCalled();
  });

  test("turning margins off hides margin ink without deleting it", async () => {
    const marginStroke = {
      color: "#1D1F23",
      width: 0.006,
      points: [
        { x: -0.1, y: 0.2 },
        { x: -0.05, y: 0.3 },
      ],
    };
    mockGetPageInk.mockResolvedValue({ strokes: [marginStroke], highlights: [] });

    // Margins off, with a stroke already drawn in one of them.
    renderView({ type: "pen", color: "#1D1F23", size: "medium" }, false);
    await layOutColumn(300);
    await waitFor(() => expect(mockGetPageInk).toHaveBeenCalledWith("d1", 1));
    // Waited on, not just requested: drawing before the stored ink has
    // landed would save over it rather than alongside it.
    await act(() => mockGetPageInk.mock.results[0]!.value);

    // The ink layer clips to the page, so the margin stroke is out of sight
    // rather than painted into the gutter beside it.
    const flatten = (style: unknown): Record<string, unknown> =>
      Object.assign({}, ...[style].flat(5).filter(Boolean));
    const layer = screen.getByTestId("pdf-page-row-1").props.children.at(-1);
    expect(flatten(layer.props.style).overflow).toBe("hidden");

    // Drawing on the page now still saves the hidden stroke alongside the
    // new one: hidden is hidden, not gone.
    const canvas = (await screen.findAllByLabelText("Drawing canvas"))[0]!;
    fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 90, locationY: 100 } });
    fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 120, locationY: 140 } });
    fireEvent(canvas, "responderRelease", { nativeEvent: {} });

    await waitFor(() => expect(mockUpdatePageInk).toHaveBeenCalled());
    const [, , body] = mockUpdatePageInk.mock.calls[0]!;
    expect(body.strokes).toHaveLength(2);
    expect(body.strokes[0]).toEqual(marginStroke);
    expect(body.strokes[1]!.points[0]!.x).toBeGreaterThan(0);
  });
});
