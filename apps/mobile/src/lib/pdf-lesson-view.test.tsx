import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { PdfLessonView, type PdfTool, rectsForWords, wordAt } from "./pdf-lesson-view";

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

test("with a marker up, tapping the first and last word saves a highlight", async () => {
  renderView({ type: "highlight", color: "blue" });
  fireEvent(await screen.findByTestId("pdf-column"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 1000 } },
  });
  await waitFor(() => expect(mockGetPageWords).toHaveBeenCalledWith("d1", 1));

  const page = screen.getByLabelText("Mark words on page 1");
  // Page 1 is 300 wide and 300 * 1.414 tall.
  const height = 300 * 1.414;
  await waitFor(() => {
    fireEvent.press(page, { nativeEvent: { locationX: 0.2 * 300, locationY: 0.12 * height } });
    fireEvent.press(page, { nativeEvent: { locationX: 0.15 * 300, locationY: 0.22 * height } });
    expect(mockUpdatePageInk).toHaveBeenCalled();
  });

  expect(mockUpdatePageInk).toHaveBeenCalledWith("d1", 1, {
    strokes: [],
    highlights: [{ color: "blue", rects: rectsForWords(WORDS) }],
  });
});
