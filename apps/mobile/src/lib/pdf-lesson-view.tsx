import type { Stroke } from "@lp/contracts";
import { highlightIndex } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, Text, View, useWindowDimensions } from "react-native";
import Pdf from "react-native-pdf";

import { getApiClient } from "@/lib/api-client";
import { DrawingCanvas } from "@/lib/notebook-drawing-canvas";
import { supabase } from "@/lib/supabase";
import { fontSizes, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";

// react-native-pdf downloads the whole file before rendering, so unlike
// pdf.js on web this URL only has to outlive the initial fetch. Kept in step
// with the web TTL anyway, and with staleTime below for the same reason:
// react-query's default window-focus refetch mints a fresh token, which
// changes `source.uri` and makes the native view re-download the whole PDF.
const SIGNED_URL_TTL_SECONDS = 8 * 60 * 60;

interface PdfLessonViewProps {
  documentId: string;
  storagePath: string;
  /** The server's own page count for this PDF, from `lecture_pdf`. Known
   * before the file downloads, so the page label never has to read
   * "page 1 of ?". */
  pageCount: number;
}

/**
 * react-native-pdf's public API exposes a page's current zoom scale
 * (`onScaleChanged`) but no pan-offset callback at all -- there's no way to
 * read how far a zoomed page has been panned, so a separately-rendered ink
 * overlay (react-native-svg, same as the standalone notebook canvas) can't
 * be kept aligned with the native view while the user pans around a zoomed
 * page. Confirmed from the installed package's index.d.ts, not assumed.
 *
 * Per the product decision this led to: read and draw are two distinct
 * modes, not simultaneous. In read mode, the native view owns pinch-zoom
 * and pan exactly like any PDF viewer, and ink is hidden/inert. "Draw"
 * locks the page to a fixed fit-width scale with panning disabled
 * (`scrollEnabled=false`), at which point the page's geometry is pinned and
 * known, so the ink overlay can be sized to match it exactly. "Done
 * drawing" hands pan/zoom back to the native view.
 *
 * The exact overlay size in the locked state is computed from
 * `onLoadComplete`'s reported page size (points) and the container's own
 * width, since react-native-pdf doesn't expose the native view's actual
 * rendered page bounds to JS -- this should be checked against a real
 * device/dev client (not Expo Go -- see the mobile section of the ink
 * annotation plan) before shipping, the same way the no-pan-offset finding
 * above was confirmed against the real package rather than assumed.
 */
export function PdfLessonView({ documentId, storagePath, pageCount }: PdfLessonViewProps) {
  const colors = useThemeColors();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { height: windowHeight } = useWindowDimensions();
  const [pageNumber, setPageNumber] = useState(1);
  // Seeded from the server's count so the page label is correct immediately,
  // then narrowed to the lower of the two once the native view reports its
  // own: the ink endpoint refuses a write past the server's page_count, so
  // navigating beyond it would offer a page that can be drawn on but not
  // saved.
  const [nativePages, setNativePages] = useState(0);
  const numPages = nativePages > 0 ? Math.min(nativePages, pageCount) : pageCount;
  const [pageAspect, setPageAspect] = useState(1.4); // height / width, refined by onLoadComplete
  const [drawMode, setDrawMode] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  // Measured rather than derived from window width minus an assumed parent
  // padding: the overlay has to match the native view's real rendered width
  // exactly, and hardcoding the lesson screen's padding silently misaligns
  // the ink the moment that padding changes (or the device rotates).
  const [boxWidth, setBoxWidth] = useState(0);

  const {
    data: signedUrl,
    isPending: urlPending,
    isError: urlError,
  } = useQuery({
    queryKey: ["lecture-pdf-url", storagePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (error) {
        // Same reasoning as onError below: the UI stays generic, but the
        // Storage error (bucket policy, missing object, expired session) is
        // the only thing that says which of those it was.
        console.warn("[lecture-pdf] signed URL failed:", storagePath, error);
        throw error;
      }
      return data.signedUrl;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const { data: ink } = useQuery({
    queryKey: ["page-ink", documentId, pageNumber],
    queryFn: () => getApiClient().getPageInk(documentId, pageNumber),
    enabled: drawMode,
  });

  const updateInkMutation = useMutation({
    mutationFn: (strokes: Stroke[]) =>
      getApiClient().updatePageInk(documentId, pageNumber, { strokes }),
    onSuccess: (result) => queryClient.setQueryData(["page-ink", documentId, pageNumber], result),
  });

  const overlayWidth = boxWidth;
  const overlayHeight = overlayWidth * pageAspect;

  function handleBoxLayout(event: LayoutChangeEvent) {
    setBoxWidth(event.nativeEvent.layout.width);
  }

  if (urlError || renderFailed) {
    return <Text style={styles.error}>Failed to load the lecture PDF.</Text>;
  }

  if (urlPending || !signedUrl) {
    return <Text style={styles.hint}>Loading PDF...</Text>;
  }

  return (
    <View>
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setPageNumber((n) => Math.max(1, n - 1))}
          disabled={pageNumber <= 1}
          style={[styles.toolButton, pageNumber <= 1 && styles.toolButtonDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.toolButtonText}>Previous</Text>
        </Pressable>
        <Text style={styles.pageLabel}>
          Page {pageNumber} of {numPages}
        </Text>
        <Pressable
          onPress={() => setPageNumber((n) => Math.min(numPages, n + 1))}
          disabled={pageNumber >= numPages}
          style={[styles.toolButton, pageNumber >= numPages && styles.toolButtonDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.toolButtonText}>Next</Text>
        </Pressable>
        <Pressable
          onPress={() => setDrawMode((d) => !d)}
          style={[styles.toolButton, drawMode && styles.toolButtonActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: drawMode }}
        >
          <Text style={styles.toolButtonText}>{drawMode ? "Done drawing" : "Draw"}</Text>
        </Pressable>
      </View>

      <View
        onLayout={handleBoxLayout}
        style={
          drawMode ? styles.pdfBoxLocked : [styles.pdfBoxFree, { height: windowHeight * 0.65 }]
        }
      >
        <Pdf
          source={{ uri: signedUrl }}
          page={pageNumber}
          scale={drawMode ? 1 : undefined}
          minScale={1}
          maxScale={3}
          fitPolicy={0}
          // react-native-pdf defaults `trustAllCerts` to true, which routes
          // the download through react-native-blob-util's
          // getUnsafeOkHttpClient -- an all-trusting TrustManager plus a
          // hostnameVerifier that returns true for every host. On Android
          // that path throws outright ("Use of own trust manager but none
          // defined") because the shared trust manager is never set, so the
          // PDF simply never loads. Turning it off is the fix *and* the
          // correct posture: this is a signed HTTPS URL to Supabase and its
          // certificate should be verified normally.
          trustAllCerts={false}
          scrollEnabled={!drawMode}
          enableDoubleTapZoom={!drawMode}
          horizontal={false}
          // Free mode is bounded by pdfBoxFree's fixed height, so flex:1
          // fills it; locked mode's container has no height of its own
          // (see pdfBoxLocked), so the Pdf view needs an explicit height
          // matching the ink overlay it's pinned under instead.
          style={drawMode ? [styles.pdf, { height: overlayHeight }] : [styles.pdf, styles.pdfFree]}
          onLoadComplete={(pages, _path, size) => {
            setNativePages(pages);
            if (size.width > 0) setPageAspect(size.height / size.width);
          }}
          onPageChanged={(page) => setPageNumber(page)}
          // An empty handler here meant every native render failure showed
          // an empty box and no message -- urlError only covers minting the
          // signed URL, not anything that happens after. The learner still
          // gets a generic message, but the reason is logged rather than
          // discarded: it comes from the native view and is the only
          // description of what actually went wrong.
          onError={(error) => {
            console.warn("[lecture-pdf] native render failed:", error);
            setRenderFailed(true);
          }}
        />
        {drawMode && overlayWidth > 0 && (
          <View
            style={[styles.inkOverlay, { width: overlayWidth, height: overlayHeight }]}
            pointerEvents="box-none"
          >
            {/* Word highlights made on the web (design.md §8), shown under the
                ink. Read-only here: react-native-pdf exposes no text to mark,
                and the PUT below sends strokes only, which leaves them
                untouched on the server. */}
            <View style={styles.highlightLayer} pointerEvents="none">
              {(ink?.highlights ?? []).flatMap((highlight, h) =>
                highlight.rects.map(([x0, y0, x1, y1], r) => (
                  <View
                    key={`${h}-${r}`}
                    style={{
                      position: "absolute",
                      left: x0 * overlayWidth,
                      top: y0 * overlayHeight,
                      width: (x1 - x0) * overlayWidth,
                      height: (y1 - y0) * overlayHeight,
                      backgroundColor: colors[`highlight${highlightIndex(highlight.color)}`],
                    }}
                  />
                )),
              )}
            </View>
            <DrawingCanvas
              strokes={ink?.strokes ?? []}
              onChange={(strokes) => updateInkMutation.mutate(strokes)}
              width={overlayWidth}
              height={overlayHeight}
              pageKey={pageNumber}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  highlightLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  toolButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  toolButtonActive: {
    backgroundColor: colors.border,
  },
  toolButtonDisabled: {
    opacity: 0.5,
  },
  toolButtonText: {
    fontSize: fontSizes.xs,
    color: colors.foreground,
  },
  pageLabel: {
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  // Height is applied at the call site from useWindowDimensions, so it
  // tracks rotation instead of freezing at the value read on first import.
  pdfBoxFree: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  // Locked (drawing) mode has no fixed height of its own -- it's sized by
  // its children, the fit-width Pdf view and the ink overlay matched to it.
  pdfBoxLocked: {
    width: "100%",
  },
  pdf: {
    width: "100%",
  },
  pdfFree: {
    flex: 1,
  },
  inkOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
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
