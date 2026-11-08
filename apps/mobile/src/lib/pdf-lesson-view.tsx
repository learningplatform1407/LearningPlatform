import type { PageHighlight, PageWord, Stroke, StrokePoint } from "@lp/contracts";
import { highlightIndex } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Pdf from "react-native-pdf";

import { getApiClient } from "@/lib/api-client";
import { DrawingCanvas } from "@/lib/notebook-drawing-canvas";
import { supabase } from "@/lib/supabase";
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

/** A tool from the lesson's tool notch, as it applies to a PDF page. */
export type PdfTool =
  { type: "highlight"; color: string } | { type: "pen"; color: string } | { type: "eraser" } | null;

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
  /** Whether a highlight's first word has been tapped, for the screen's
   * marking hint. */
  onAnchorChange?: (set: boolean) => void;
  /** A highlight or ink save failed. */
  onSaveError?: () => void;
}

type WordAnchor = { page: number; index: number };

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

/** The word under a point, or failing that the closest one on the same line
 * height -- a tap between two words still means one of them. */
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
  onAnchorChange,
  onSaveError,
}: PdfLessonViewProps) {
  const { t } = useI18n();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [top, setTop] = useState(0);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [anchor, setAnchor] = useState<WordAnchor | null>(null);
  // A new tool starts a new range.
  const [anchorTool, setAnchorTool] = useState(tool);
  if (anchorTool !== tool) {
    setAnchorTool(tool);
    setAnchor(null);
  }

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
  const pageHeight = width * aspect;
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
              width={width}
              height={pageHeight}
              rendered={near && (page === 1 || firstLoaded)}
              tool={tool}
              anchor={anchor?.page === page ? anchor.index : null}
              onAnchor={(next) => {
                setAnchor(next === null ? null : { page, index: next });
                onAnchorChange?.(next !== null);
              }}
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
  rendered,
  tool,
  anchor,
  onAnchor,
  onLoaded,
  onFailed,
  onSaveError,
}: {
  documentId: string;
  page: number;
  source: { uri: string; cache: boolean; cacheFileName: string };
  width: number;
  height: number;
  rendered: boolean;
  tool: PdfTool;
  anchor: number | null;
  onAnchor: (index: number | null) => void;
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
  });

  const strokes = ink?.strokes ?? [];
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

  function tapToMark(x: number, y: number) {
    if (tool?.type !== "highlight" || !words) return;
    if (words.words.length === 0) {
      Alert.alert(t("lesson.pdfView.noTextTitle"), t("lesson.pdfView.noTextScan"));
      return;
    }
    const index = wordAt(words.words, x / width, y / height);
    if (index === null) return;
    if (anchor === null) {
      onAnchor(index);
      return;
    }
    onAnchor(null);
    const run = words.words.slice(Math.min(anchor, index), Math.max(anchor, index) + 1);
    save.mutate({
      strokes,
      highlights: [...highlights, { color: tool.color, rects: rectsForWords(run) }],
    });
  }

  const shownHighlights = erasedHighlights ?? highlights;
  const anchorBox = anchor !== null ? words?.words[anchor]?.box : undefined;

  return (
    <View
      style={[styles.page, { width, height }]}
      accessibilityLabel={t("lesson.pdfView.page", { number: page })}
      testID={`pdf-page-${page}`}
    >
      {rendered ? (
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
        {anchorBox && (
          <View
            style={[
              styles.anchor,
              {
                left: anchorBox[0] * width - 2,
                top: anchorBox[1] * height - 2,
                width: (anchorBox[2] - anchorBox[0]) * width + 4,
                height: (anchorBox[3] - anchorBox[1]) * height + 4,
              },
            ]}
          />
        )}
      </View>

      {/* Ink on top: read-only until the pen or eraser is picked up. */}
      <View
        style={styles.layer}
        pointerEvents={tool?.type === "pen" || tool?.type === "eraser" ? "auto" : "none"}
      >
        <DrawingCanvas
          strokes={strokes}
          width={width}
          height={height}
          pageKey={page}
          readOnly={!(tool?.type === "pen" || tool?.type === "eraser")}
          tool={tool?.type === "eraser" ? "eraser" : "pen"}
          penColor={tool?.type === "pen" ? tool.color : undefined}
          onChange={(next) => {
            pendingStrokes.current = next;
          }}
          onErasePoint={(point) =>
            setErasedHighlights((current) =>
              (current ?? highlights).filter((highlight) => !hitsHighlight(highlight, point)),
            )
          }
          onGestureEnd={finishGesture}
        />
      </View>

      {marking && (
        <Pressable
          style={styles.layer}
          onPress={(event) => tapToMark(event.nativeEvent.locationX, event.nativeEvent.locationY)}
          accessibilityRole="button"
          accessibilityLabel={t("lesson.pdfView.markWords", { number: page })}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  column: {
    gap: PAGE_GAP,
  },
  page: {
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
  anchor: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 3,
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
