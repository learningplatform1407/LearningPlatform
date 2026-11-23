import type { PageHighlight, PageWord, Stroke, StrokePoint } from "@lp/contracts";
import { clearHighlightRects, highlightIndex, pageColors, type PenSize } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, type LayoutChangeEvent, Text, View } from "react-native";
import Pdf from "react-native-pdf";

import { getApiClient } from "@/lib/api-client";
import { DrawingCanvas } from "@/lib/notebook-drawing-canvas";
import { supabase } from "@/lib/supabase";
import { charWidth } from "@/lib/text-letters";
import { fontSizes, shadows } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

// react-native-pdf downloads the file once (see `cache` below), so this URL
// only has to outlive that first fetch. Kept in step with the web TTL, and
// with staleTime below so a window-focus refetch doesn't mint a new URL.
const SIGNED_URL_TTL_SECONDS = 8 * 60 * 60;

const PAGE_GAP = 18;
// A4 until the first page reports its real size.
const DEFAULT_ASPECT = 1.414;
// How far beyond the screen, above and below, pages are kept rendered.
const RENDER_MARGIN_SCREENS = 1;
// Normalised hit radius when erasing highlights, as for strokes.
const ERASE_RADIUS = 0.02;

/**
 * How much of a page's width each writing margin takes. Matches the web's
 * MARGIN_FRACTION, and so does the storage: ink in a margin keeps
 * page-normalised coordinates, just outside [0, 1], so a note written beside
 * the text on one platform lands in the same place on the other.
 *
 * **Every page has them here, with no toggle** -- unlike the web, where they
 * are a tool-notch preference. Not a product whim: toggling them resized
 * every mounted page and re-windowed which pages are mounted, all in one
 * frame, and AndroidPdfViewer's render thread crashes when a queued bitmap
 * job finds the document it was for recycled ("Get page pdf document null",
 * RenderingHandler.handleMessage -> renderPageBitmap -> openPage). That race
 * is the library's, and it is not ours to fix; what is ours is not to put a
 * button on it. Constant margins mean page size changes only on rotation,
 * exactly as before they existed.
 */
const MARGIN_FRACTION = 0.18;

/** A tool from the lesson's tool notch, as it applies to a PDF page. */
export type PdfTool =
  | { type: "highlight"; color: string }
  | { type: "pen"; color: string; size: PenSize }
  | { type: "eraser" }
  | null;

interface PdfLessonViewProps {
  documentId: string;
  storagePath: string;
  /** The server's page count, known before the file downloads. */
  pageCount: number;
  tool: PdfTool;
  /** The part of the lesson's scroll content on screen, in the same
   * coordinates as this view's own layout: pages near it are rendered. */
  viewportTop: number;
  viewportHeight: number;
  /** True while a highlight is being dragged: the screen locks its scroll. */
  onMarkingChange?: (marking: boolean) => void;
  /** A highlight or ink save failed. */
  onSaveError?: () => void;
}

// How long a finger has to rest on a page before a drag marks instead of
// scrolling, and how far it may drift while resting -- as in the text view.
const MARK_HOLD_MS = 250;
const MARK_SLOP = 10;

/**
 * Each word's box split into one box per letter, so a PDF highlight can
 * start and stop inside a word, as in the text view. The server gives word
 * boxes only, so each word's width is shared out between its letters by
 * their typical advance widths (lib/text-letters): exact at both ends of the
 * word, and within a letter of the print in between.
 */
export function lettersOfWords(words: PageWord[]): PageWord[] {
  const letters: PageWord[] = [];
  for (const word of words) {
    const chars = [...word.text].filter((ch) => !/\s/u.test(ch));
    if (chars.length === 0) continue;
    const [x0, y0, x1, y1] = word.box;
    const total = chars.reduce((sum, ch) => sum + charWidth(ch), 0);
    let at = x0;
    for (const ch of chars) {
      const next = at + ((x1 - x0) * charWidth(ch)) / total;
      letters.push({ text: ch, line: word.line, box: [at, y0, next, y1] });
      at = next;
    }
  }
  return letters;
}

/** One rectangle per run of words on a printed line, padded a little so the
 * mark covers the whole glyphs rather than their tight boxes. */
export function rectsForWords(words: PageWord[]): PageHighlight["rects"] {
  const rects: PageHighlight["rects"] = [];
  let line: number | null = null;
  for (const { box, line: wordLine } of words) {
    const last = rects[rects.length - 1];
    if (last && wordLine === line) {
      last[0] = Math.min(last[0], box[0]);
      last[1] = Math.min(last[1], box[1]);
      last[2] = Math.max(last[2], box[2]);
      last[3] = Math.max(last[3], box[3]);
    } else {
      rects.push([...box]);
    }
    line = wordLine;
  }
  const pad = 0.002;
  return rects.map(([x0, y0, x1, y1]) => [
    Math.max(0, x0 - pad),
    Math.max(0, y0 - pad),
    Math.min(1, x1 + pad),
    Math.min(1, y1 + pad),
  ]);
}

/** The word (or letter) under a point, or failing that the closest one on
 * the same line height -- a point between two of them still means one. */
export function wordAt(words: PageWord[], x: number, y: number): number | null {
  let best: number | null = null;
  let bestDistance = 0.05;
  words.forEach(({ box: [x0, y0, x1, y1] }, index) => {
    if (y < y0 - 0.01 || y > y1 + 0.01) return;
    const distance = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function hitsHighlight(highlight: PageHighlight, { x, y }: StrokePoint): boolean {
  return highlight.rects.some(
    ([x0, y0, x1, y1]) =>
      x >= x0 - ERASE_RADIUS &&
      x <= x1 + ERASE_RADIUS &&
      y >= y0 - ERASE_RADIUS &&
      y <= y1 + ERASE_RADIUS,
  );
}

/**
 * The lecture PDF as a column of pages, like the web (design.md §8): each
 * page a card of its own, scrolled with the lesson, marked with the same
 * tools from the tool notch as the text view.
 *
 * Every page is its own single-page native view at a fixed fit-width size,
 * not one zoomable viewer. react-native-pdf reports no pan offset, so an
 * overlay could only be kept on a zoomed, panned page by guessing; a fixed
 * page has known geometry, and its highlights and ink sit exactly on it.
 * Only pages near the screen are rendered, and only after the first has
 * loaded: that first load fills the download cache the rest then read from,
 * instead of every page fetching the whole file at once.
 */
export function PdfLessonView({
  documentId,
  storagePath,
  pageCount,
  tool,
  viewportTop,
  viewportHeight,
  onMarkingChange,
  onSaveError,
}: PdfLessonViewProps) {
  const { t } = useI18n();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [top, setTop] = useState(0);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const {
    data: signedUrl,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["lecture-pdf-url", storagePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (error) {
        // The UI stays generic; the Storage error (bucket policy, missing
        // object, expired session) is the only thing that says which.
        console.warn("[lecture-pdf] signed URL failed:", storagePath, error);
        throw error;
      }
      return data.signedUrl;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  function handleLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
    setTop(event.nativeEvent.layout.y);
  }

  if (isError || failed) {
    return <Text style={styles.error}>{t("lesson.pdfView.loadFailed")}</Text>;
  }
  if (isPending || !signedUrl) {
    return <Text style={styles.hint}>{t("lesson.pdfView.loading")}</Text>;
  }

  // A storage path is never reused for different bytes (a replacement gets
  // a new one), so it names the cached file safely.
  const source = {
    uri: signedUrl,
    cache: true,
    cacheFileName: `lecture-${storagePath.replace(/[^\w.-]/g, "_")}`,
  };
  // The page makes room for its margins rather than the column growing, so
  // no page is ever pushed off the side of the screen. The margins are
  // rounded to whole points first and the page takes the rest, so the three
  // always add up to exactly the column's width.
  const marginWidth = Math.round((width * MARGIN_FRACTION) / (1 + 2 * MARGIN_FRACTION));
  const pageWidth = width - 2 * marginWidth;
  const pageHeight = pageWidth * aspect;
  const renderFrom = viewportTop - top - viewportHeight * RENDER_MARGIN_SCREENS;
  const renderTo = viewportTop - top + viewportHeight * (1 + RENDER_MARGIN_SCREENS);

  return (
    <View onLayout={handleLayout} style={styles.column} testID="pdf-column">
      {width > 0 &&
        Array.from({ length: pageCount }, (_, index) => {
          const page = index + 1;
          const pageTop = index * (pageHeight + PAGE_GAP);
          const near = pageTop + pageHeight >= renderFrom && pageTop <= renderTo;
          return (
            <PdfPage
              key={page}
              documentId={documentId}
              page={page}
              source={source}
              width={pageWidth}
              height={pageHeight}
              marginWidth={marginWidth}
              rendered={near && (page === 1 || firstLoaded)}
              tool={tool}
              onMarkingChange={onMarkingChange}
              onSaveError={onSaveError}
              onLoaded={(size) => {
                if (page !== 1) return;
                setFirstLoaded(true);
                if (size.width > 0) setAspect(size.height / size.width);
              }}
              onFailed={() => setFailed(true)}
            />
          );
        })}
    </View>
  );
}

function PdfPage({
  documentId,
  page,
  source,
  width,
  height,
  marginWidth,
  rendered,
  tool,
  onMarkingChange,
  onLoaded,
  onFailed,
  onSaveError,
}: {
  documentId: string;
  page: number;
  source: { uri: string; cache: boolean; cacheFileName: string };
  width: number;
  height: number;
  /** Each margin's width in points. */
  marginWidth: number;
  rendered: boolean;
  tool: PdfTool;
  onMarkingChange?: (marking: boolean) => void;
  onLoaded: (size: { width: number; height: number }) => void;
  onFailed: () => void;
  onSaveError?: () => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const inkKey = ["page-ink", documentId, page];

  const { data: ink } = useQuery({
    queryKey: inkKey,
    queryFn: () => getApiClient().getPageInk(documentId, page),
    enabled: rendered,
  });
  const marking = tool?.type === "highlight";
  const { data: words } = useQuery({
    queryKey: ["page-words", documentId, page],
    queryFn: () => getApiClient().getPageWords(documentId, page),
    enabled: rendered && marking,
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: (body: { strokes: Stroke[]; highlights?: PageHighlight[] }) =>
      getApiClient().updatePageInk(documentId, page, body),
    onMutate: (body) => {
      // Shown at once; the server's answer replaces it.
      queryClient.setQueryData(inkKey, {
        strokes: body.strokes,
        highlights: body.highlights ?? ink?.highlights ?? [],
      });
    },
    onSuccess: (result) => queryClient.setQueryData(inkKey, result),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: inkKey });
      onSaveError?.();
    },
    // Either way the cache is now the truth -- the server's answer, or the
    // refetch a failure asks for -- so the local copy steps aside.
    onSettled: () => setSavingStrokes(null),
  });

  // The ink as the canvas last left it, held until the save has landed.
  //
  // This is what stopped a finished line from flickering. The canvas drops
  // the stroke it was drawing the moment the finger lifts and hands it over
  // through `onChange`; that used to write it to a ref, so nothing
  // re-rendered and the line vanished until react-query ran the mutation's
  // onMutate a tick later and put it in the cache. One frame with neither
  // copy on screen is exactly the blink that was reported.
  const [savingStrokes, setSavingStrokes] = useState<Stroke[] | null>(null);
  const strokes = savingStrokes ?? ink?.strokes ?? [];
  const highlights = ink?.highlights ?? [];
  // One erase gesture's results, saved together when the finger lifts.
  const [erasedHighlights, setErasedHighlights] = useState<PageHighlight[] | null>(null);
  const pendingStrokes = useRef<Stroke[] | null>(null);

  function finishGesture() {
    const nextStrokes = pendingStrokes.current;
    const nextHighlights =
      erasedHighlights && erasedHighlights.length !== highlights.length
        ? erasedHighlights
        : undefined;
    pendingStrokes.current = null;
    setErasedHighlights(null);
    if (nextStrokes || nextHighlights) {
      save.mutate({ strokes: nextStrokes ?? strokes, highlights: nextHighlights });
    }
  }

  const letters = useMemo(() => (words ? lettersOfWords(words.words) : null), [words]);
  // Read when the hold timer fires, not when it was set: words that arrive
  // while a finger is already down still let that hold start a mark.
  const lettersRef = useRef(letters);
  useEffect(() => {
    lettersRef.current = letters;
  }, [letters]);
  // A highlight being dragged: from the letter held to the one under the
  // finger, by index into `letters`.
  const gesture = useRef<{
    x: number;
    y: number;
    pageX: number;
    pageY: number;
    timer: ReturnType<typeof setTimeout>;
    anchor: number | null;
    current: number | null;
  } | null>(null);
  const [preview, setPreview] = useState<[number, number] | null>(null);

  function runOf(a: number, b: number): PageWord[] {
    return (letters ?? []).slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  function beginMark() {
    const g = gesture.current;
    const letters = lettersRef.current;
    if (!g || tool?.type !== "highlight" || !letters) return;
    if (letters.length === 0) {
      gesture.current = null;
      Alert.alert(t("lesson.pdfView.noTextTitle"), t("lesson.pdfView.noTextScan"));
      return;
    }
    const index = wordAt(letters, g.x / width, g.y / height);
    if (index === null) return;
    g.anchor = index;
    g.current = index;
    setPreview([index, index]);
    onMarkingChange?.(true);
  }

  function finishMark(commit: boolean) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    clearTimeout(g.timer);
    if (g.anchor === null || g.current === null) return;
    setPreview(null);
    onMarkingChange?.(false);
    if (commit && tool?.type === "highlight") {
      const rects = rectsForWords(runOf(g.anchor, g.current));
      // Cut out of the marks already there before adding this one: a page's
      // fills are translucent, so two left on top of each other mix into a
      // colour that is in no swatch instead of the second replacing the
      // first (clearHighlightRects).
      save.mutate({
        strokes,
        highlights: [...clearHighlightRects(highlights, rects), { color: tool.color, rects }],
      });
    }
  }

  const shownHighlights = erasedHighlights ?? highlights;
  const previewRects = preview ? rectsForWords(runOf(...preview)) : [];

  const inkTool = tool?.type === "pen" || tool?.type === "eraser";
  // The margins' real size in page units, from their rounded point width --
  // not the nominal MARGIN_FRACTION -- so a touch on the page maps to the
  // coordinate it always had, to the point.
  const marginFraction = width > 0 ? marginWidth / width : 0;

  return (
    // The page and its writing margins.
    <View
      style={[styles.pageRow, { width: width + 2 * marginWidth, height }]}
      testID={`pdf-page-row-${page}`}
    >
      {inkTool && (
        <>
          {/* Tinted only while the pen or eraser is in hand: a faint panel
              beside every page of a 400-page book would be noise, but at
              the moment the pen comes out it is the only thing that says
              "you can write here". */}
          <View style={[styles.margin, { width: marginWidth, left: 0 }]} />
          <View style={[styles.margin, { width: marginWidth, right: 0 }]} />
        </>
      )}

      <View
        style={[styles.page, { width, height, left: marginWidth }]}
        accessibilityLabel={t("lesson.pdfView.page", { number: page })}
        testID={`pdf-page-${page}`}
      >
        {/* The page image takes no touches at all.

          `scrollEnabled={false}` stops the native viewer from scrolling, but
          not from *claiming* the gesture: on iOS, PDFKit's own scroll view
          still swallows every drag that starts over a page, so dragging on
          the lesson scrolled nothing and only the gaps beside the pages
          worked. Nothing here wants the viewer's gestures -- zoom and paging
          are off, and marking and ink are the sibling layers below -- so the
          whole subtree opts out and drags reach the lesson's ScrollView. */}
        {rendered ? (
          <View style={styles.layer} pointerEvents="none">
            <Pdf
              source={source}
              page={page}
              singlePage
              fitPolicy={0}
              spacing={0}
              scrollEnabled={false}
              enableDoubleTapZoom={false}
              // react-native-pdf defaults this to true, which on Android routes
              // the download through an all-trusting client that throws ("Use of
              // own trust manager but none defined") and never loads. Off is the
              // fix and the right posture for a signed HTTPS URL.
              trustAllCerts={false}
              style={[styles.pdf, { width, height }]}
              onLoadComplete={(_pages, _path, size) => onLoaded(size)}
              onError={(error) => {
                // Logged, since the native view's message is the only account
                // of what went wrong; the learner sees the generic one.
                console.warn("[lecture-pdf] native render failed:", page, error);
                onFailed();
              }}
            />
          </View>
        ) : (
          <Text style={styles.placeholder}>{t("lesson.pdfView.page", { number: page })}</Text>
        )}

        <View style={styles.layer} pointerEvents="none">
          {shownHighlights.flatMap((highlight, h) =>
            highlight.rects.map(([x0, y0, x1, y1], r) => (
              <View
                key={`${h}-${r}`}
                testID="pdf-highlight"
                style={{
                  position: "absolute",
                  left: x0 * width,
                  top: y0 * height,
                  width: (x1 - x0) * width,
                  height: (y1 - y0) * height,
                  backgroundColor: colors[`highlight${highlightIndex(highlight.color)}`],
                }}
              />
            )),
          )}
          {previewRects.map(([x0, y0, x1, y1], r) => (
            <View
              key={`preview-${r}`}
              testID="pdf-mark-preview"
              style={[
                styles.preview,
                {
                  left: x0 * width,
                  top: y0 * height,
                  width: (x1 - x0) * width,
                  height: (y1 - y0) * height,
                },
              ]}
            />
          ))}
        </View>

        {/* Press and hold, then drag, to mark -- the text view's gesture. A
            quick swipe still scrolls the lesson; the scroll is locked only
            once a mark is under way. Inside the page, because it measures
            touches against the page's own width. */}
        {marking && (
          <View
            style={styles.layer}
            testID={`pdf-mark-layer-${page}`}
            accessibilityLabel={t("lesson.pdfView.markWords", { number: page })}
            onStartShouldSetResponder={() => true}
            onResponderGrant={(event) => {
              const { locationX, locationY, pageX, pageY } = event.nativeEvent;
              gesture.current = {
                x: locationX,
                y: locationY,
                pageX,
                pageY,
                timer: setTimeout(beginMark, MARK_HOLD_MS),
                anchor: null,
                current: null,
              };
            }}
            onResponderMove={(event) => {
              const g = gesture.current;
              if (!g) return;
              const x = g.x + (event.nativeEvent.pageX - g.pageX);
              const y = g.y + (event.nativeEvent.pageY - g.pageY);
              if (g.anchor === null) {
                if (Math.hypot(x - g.x, y - g.y) > MARK_SLOP) clearTimeout(g.timer);
                return;
              }
              const index = letters ? wordAt(letters, x / width, y / height) : null;
              if (index === null || index === g.current) return;
              g.current = index;
              setPreview([g.anchor, index]);
            }}
            onResponderTerminationRequest={() => gesture.current?.anchor == null}
            onResponderRelease={() => finishMark(true)}
            onResponderTerminate={() => finishMark(false)}
          />
        )}
      </View>

      {/* Ink last, over the page *and* its margins: the canvas covers the
          whole row but keeps page coordinates, so a stroke in a margin is
          stored at an x outside [0, 1] and every stroke made before margins
          existed lands exactly where it did. While a highlight is being
          dragged this layer takes no touches, so they reach the mark layer
          on the page beneath it. */}
      <View style={styles.inkLayer} pointerEvents={inkTool ? "auto" : "none"}>
        <DrawingCanvas
          strokes={strokes}
          width={width + 2 * marginWidth}
          height={height}
          xSpan={{ from: -marginFraction, to: 1 + marginFraction }}
          pageKey={page}
          readOnly={!inkTool}
          tool={tool?.type === "eraser" ? "eraser" : "pen"}
          penColor={tool?.type === "pen" ? tool.color : undefined}
          penSize={tool?.type === "pen" ? tool.size : undefined}
          onChange={(next) => {
            pendingStrokes.current = next;
            setSavingStrokes(next);
          }}
          onErasePoint={(point) =>
            setErasedHighlights((current) =>
              (current ?? highlights).filter((highlight) => !hitsHighlight(highlight, point)),
            )
          }
          onGestureEnd={finishGesture}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  column: {
    gap: PAGE_GAP,
  },
  // The page and its writing margins, side by side. The page is placed
  // absolutely inside it, so the margins are beside the page rather than
  // taking width off it.
  pageRow: {
    position: "relative",
  },
  margin: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: colors.muted,
    borderRadius: 4,
  },
  page: {
    position: "absolute",
    top: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  pdf: {
    backgroundColor: "#FFFFFF",
  },
  placeholder: {
    fontSize: fontSizes.sm,
    color: "#8A8D93",
  },
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Clipped to the page and its margins, which is what hides margin ink
  // again when the margins are turned off: the strokes are still stored, and
  // still saved by every later edit, but this box is then only the page and
  // they fall outside it.
  inkLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  // The mark under way, before it is saved: the text view's preview tint.
  preview: {
    position: "absolute",
    backgroundColor: pageColors.noteSelection,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
}));
