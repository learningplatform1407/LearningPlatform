import type { Stroke } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Pdf from "react-native-pdf";

import { getApiClient } from "@/lib/api-client";
import { DrawingCanvas } from "@/lib/notebook-drawing-canvas";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, spacing } from "@/lib/theme";

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");

interface PdfLessonViewProps {
  documentId: string;
  storagePath: string;
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
export function PdfLessonView({ documentId, storagePath }: PdfLessonViewProps) {
  const queryClient = useQueryClient();
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageAspect, setPageAspect] = useState(1.4); // height / width, refined by onLoadComplete
  const [drawMode, setDrawMode] = useState(false);

  const {
    data: signedUrl,
    isPending: urlPending,
    isError: urlError,
  } = useQuery({
    queryKey: ["lecture-pdf-url", storagePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
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

  const overlayWidth = WINDOW_WIDTH - spacing.lg * 2;
  const overlayHeight = overlayWidth * pageAspect;

  if (urlError) {
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
          Page {pageNumber} of {numPages || "?"}
        </Text>
        <Pressable
          onPress={() => setPageNumber((n) => Math.min(numPages || n, n + 1))}
          disabled={numPages > 0 && pageNumber >= numPages}
          style={[
            styles.toolButton,
            numPages > 0 && pageNumber >= numPages && styles.toolButtonDisabled,
          ]}
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

      <View style={drawMode ? styles.pdfBoxLocked : styles.pdfBoxFree}>
        <Pdf
          source={{ uri: signedUrl }}
          page={pageNumber}
          scale={drawMode ? 1 : undefined}
          minScale={1}
          maxScale={3}
          fitPolicy={0}
          scrollEnabled={!drawMode}
          enableDoubleTapZoom={!drawMode}
          horizontal={false}
          // Free mode is bounded by pdfBoxFree's fixed height, so flex:1
          // fills it; locked mode's container has no height of its own
          // (see pdfBoxLocked), so the Pdf view needs an explicit height
          // matching the ink overlay it's pinned under instead.
          style={drawMode ? [styles.pdf, { height: overlayHeight }] : [styles.pdf, styles.pdfFree]}
          onLoadComplete={(pages, _path, size) => {
            setNumPages(pages);
            if (size.width > 0) setPageAspect(size.height / size.width);
          }}
          onPageChanged={(page) => setPageNumber(page)}
          onError={() => {}}
        />
        {drawMode && (
          <View
            style={[styles.inkOverlay, { width: overlayWidth, height: overlayHeight }]}
            pointerEvents="box-none"
          >
            <DrawingCanvas
              strokes={ink?.strokes ?? []}
              onChange={(strokes) => updateInkMutation.mutate(strokes)}
              width={overlayWidth}
              height={overlayHeight}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  pdfBoxFree: {
    width: "100%",
    height: WINDOW_HEIGHT * 0.65,
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
});
