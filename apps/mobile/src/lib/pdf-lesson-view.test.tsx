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

function renderView(tool: PdfTool) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PdfLessonView
        documentId="d1"
        storagePath="lectures/a.pdf"
        pageCount={3}
        tool={tool}
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
  // In a 300pt column the page is 220pt wide -- it makes room for a margin
  // either side (MARGIN_FRACTION) -- and 220 * 1.414 tall. The mark layer
  // sits on the page, so a touch is measured against the page, not the row.
  const width = 300 - 2 * 40;
  const height = width * 1.414;
  const from = { x: 0.2 * width, y: 0.12 * height }; // the "e" of "Hello"
  const to = { x: 0.12 * width, y: 0.22 * height }; // the "N" of "Next"

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

  test("every page leaves room for a margin either side", async () => {
    renderView(null);
    await layOutColumn(300);

    // 18% of the page each side, rounded to whole points, with the page
    // taking the rest -- so the three add up to the column exactly and no
    // page overflows it. There is no toggle here: a page's size changing at
    // the tap of a button crashed AndroidPdfViewer's render thread, so the
    // margins are simply always there (see MARGIN_FRACTION).
    const { page, row } = widths();
    expect(row).toBe(300);
    expect(page).toBe(220); // 300 - 2 * round(300 * 0.18 / 1.36)
    expect(page + 2 * 40).toBe(300);
  });

  test("the page keeps that size for the life of the screen", async () => {
    renderView({ type: "pen", color: "#1D1F23", size: "medium" });
    await layOutColumn(300);
    const before = widths();

    // Picking up and putting down the pen tints the margins, and must not
    // resize anything: a resize is what the native renderer cannot survive.
    await act(() => mockGetPageInk.mock.results[0]!.value);
    expect(widths()).toEqual(before);
  });

  test("ink drawn in a margin is stored outside the page, and keeps its width", async () => {
    renderView({ type: "pen", color: "#1D1F23", size: "medium" });
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

  test("ink already on a page is not rewritten when it loads", async () => {
    const stroke = {
      color: "#1D1F23",
      width: 0.006,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.3 },
      ],
    };
    mockGetPageInk.mockResolvedValue({ strokes: [stroke], highlights: [] });

    renderView({ type: "pen", color: "#1D1F23", size: "medium" });
    await layOutColumn(300);

    // The stored points are still the stored points, which is what keeps a
    // mark where it was drawn.
    await waitFor(() => expect(mockGetPageInk).toHaveBeenCalledWith("d1", 1));
    expect(mockUpdatePageInk).not.toHaveBeenCalled();
  });

  test("drawing on the page keeps the ink already in the margins", async () => {
    renderView({ type: "pen", color: "#1D1F23", size: "medium" });
    await layOutColumn(300);
    const canvas = (await screen.findAllByLabelText("Drawing canvas"))[0]!;

    // Drawn through the UI rather than seeded through the fetch, so there is
    // no "has the stored ink landed yet?" to race: the canvas keeps the
    // finished stroke locally until the save comes back.
    fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 30, locationY: 100 } });
    fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 34, locationY: 140 } });
    fireEvent(canvas, "responderRelease", { nativeEvent: {} });
    await waitFor(() => expect(mockUpdatePageInk).toHaveBeenCalledTimes(1));

    // Now one on the page itself.
    fireEvent(canvas, "responderGrant", { nativeEvent: { locationX: 90, locationY: 100 } });
    fireEvent(canvas, "responderMove", { nativeEvent: { locationX: 120, locationY: 140 } });
    fireEvent(canvas, "responderRelease", { nativeEvent: {} });
    await waitFor(() => expect(mockUpdatePageInk).toHaveBeenCalledTimes(2));

    const [, , body] = mockUpdatePageInk.mock.calls[1]!;
    expect(body.strokes).toHaveLength(2);
    // The margin one is still there, outside the page, and the new one is on it.
    expect(body.strokes[0]!.points[0]!.x).toBeLessThan(0);
    expect(body.strokes[1]!.points[0]!.x).toBeGreaterThan(0);
  });

  test("the ink layer clips to the page and its margins", async () => {
    // Which is what keeps web-drawn ink beyond this platform's margins out
    // of the gutter, rather than painting it beside the page.
    renderView({ type: "pen", color: "#1D1F23", size: "medium" });
    await layOutColumn(300);

    const flatten = (style: unknown): Record<string, unknown> =>
      Object.assign({}, ...[style].flat(5).filter(Boolean));
    const layer = screen.getByTestId("pdf-page-row-1").props.children.at(-1);
    expect(flatten(layer.props.style).overflow).toBe("hidden");
  });
});

describe("pinch to zoom", () => {
  /** The box a page is laid out in, and the size its image is rendered at. */
  function sizes(page = 1) {
    const flatten = (style: unknown): Record<string, number> =>
      Object.assign({}, ...[style].flat(5).filter(Boolean));
    const row = flatten(screen.getByTestId(`pdf-page-row-${page}`).props.style);
    const image = flatten(screen.getByTestId(`pdf-page-image-${page}`).props.style);
    const transform = image.transform as unknown as { scale?: number }[] | undefined;
    return { row: row.width, image: image.width, scale: transform?.[0]?.scale };
  }

  function touches(...xs: number[]) {
    return { nativeEvent: { touches: xs.map((pageX) => ({ pageX, pageY: 100 })) } };
  }

  /**
   * Drives the pinch through the responder props directly, rather than
   * through fireEvent: the handlers live on a ScrollView, which the testing
   * library treats specially and whose "responderGrant" it answers by
   * calling onStartShouldSetResponder with no event at all. act() is what
   * fireEvent would otherwise have done for us.
   */
  function pinchTo(from: [number, number], to: [number, number]) {
    const surface = pinchSurface();
    act(() => {
      surface.props.onResponderGrant(touches(...from));
      surface.props.onResponderMove(touches(...to));
      surface.props.onResponderRelease(touches(...to));
    });
  }

  /** The surface that claims a pinch: the horizontal pan around the pages. */
  function pinchSurface() {
    return screen.getByTestId("pdf-pan");
  }

  test("two fingers spreading zoom the page, and it commits when they lift", async () => {
    renderView(null);
    await layOutColumn(300);
    expect(sizes().row).toBe(300);

    pinchTo([100, 200], [50, 250]); // 100pt apart, then 200pt: twice

    expect(sizes().row).toBe(600);
  });

  test("the page image is never resized, however far it is zoomed", async () => {
    // The whole reason zoom is a transform: resizing a <Pdf> is what crashes
    // AndroidPdfViewer's render thread (docs ink §6.2.1).
    renderView(null);
    await layOutColumn(300);
    const atFit = sizes();
    expect(atFit.image).toBe(220);
    expect(atFit.scale).toBe(1);

    pinchTo([100, 200], [0, 300]);

    const zoomed = sizes();
    expect(zoomed.image).toBe(220); // rendered size: unchanged
    expect(zoomed.scale).toBe(3); // scaled into its box instead
    expect(zoomed.row).toBe(900);
  });

  test("it does not zoom past three times, however hard you pull", async () => {
    renderView(null);
    await layOutColumn(300);

    pinchTo([140, 160], [0, 1000]); // 20pt apart, then 1000pt: fifty times

    expect(sizes().scale).toBe(3);
  });

  test("one finger is a scroll, not a pinch", async () => {
    renderView(null);
    await layOutColumn(300);
    const surface = pinchSurface();

    expect(surface.props.onStartShouldSetResponder(touches(100))).toBe(false);
    expect(surface.props.onStartShouldSetResponder(touches(100, 200))).toBe(true);
  });

  test("with a tool in hand the touch belongs to the tool", async () => {
    // Same rule the pen already follows: put it down to scroll -- and now,
    // to zoom. It is also what keeps the pinch clear of the drawing
    // responder entirely.
    renderView({ type: "pen", color: "#1D1F23", size: "medium" });
    await layOutColumn(300);

    expect(pinchSurface().props.onStartShouldSetResponder(touches(100, 200))).toBe(false);
  });

  test("the lesson is told to stop scrolling while a pinch is under way", async () => {
    const onZoomingChange = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PdfLessonView
          documentId="d1"
          storagePath="lectures/a.pdf"
          pageCount={3}
          tool={null}
          viewportTop={0}
          viewportHeight={800}
          onZoomingChange={onZoomingChange}
        />
      </QueryClientProvider>,
    );
    await layOutColumn(300);

    const surface = pinchSurface();
    act(() => surface.props.onResponderGrant(touches(100, 200)));
    expect(onZoomingChange).toHaveBeenLastCalledWith(true);

    act(() => surface.props.onResponderRelease(touches(100, 200)));
    expect(onZoomingChange).toHaveBeenLastCalledWith(false);
  });

  test("panning sideways is only offered once a page is wider than the column", async () => {
    renderView(null);
    await layOutColumn(300);
    expect(pinchSurface().props.scrollEnabled).toBe(false);

    pinchTo([100, 200], [50, 250]);

    expect(pinchSurface().props.scrollEnabled).toBe(true);
  });
});
