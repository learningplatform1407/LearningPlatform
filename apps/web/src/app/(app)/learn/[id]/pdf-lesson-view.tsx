"use client";

import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Stroke } from "@lp/contracts";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { createClient } from "@/lib/supabase/client";

import { DrawingCanvas } from "../notebook/drawing-canvas";

// The worker script is a static copy of pdfjs-dist's build output in
// public/ (see apps/web/public/pdf.worker.min.mjs) rather than a bundler
// `new URL(..., import.meta.url)` reference -- that pattern isn't reliably
// supported across both Turbopack and webpack, whereas a plain absolute URL
// the browser fetches directly works the same under either. Re-copy that
// file from node_modules/pdfjs-dist/build/ whenever the pdfjs-dist version
// bumps.
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const ZOOM_STEP = 0.25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

// pdf.js range-fetches the file lazily for the whole life of the document,
// not just during the initial load, so this URL has to outlive the reading
// session -- on a shorter TTL an expired token surfaces hours in as pages
// that silently refuse to render. Paired with `staleTime: Infinity` below so
// exactly one URL is minted per mount and never swapped out from under a
// document that's already loaded.
const SIGNED_URL_TTL_SECONDS = 8 * 60 * 60;

interface PdfLessonViewProps {
  documentId: string;
  storagePath: string;
  /** The server's own page count for this PDF, from `lecture_pdf`. */
  pageCount: number;
}

export function PdfLessonView({ documentId, storagePath, pageCount }: PdfLessonViewProps) {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  // Both failures record *what* failed rather than a bare boolean, so each
  // is derived below by comparing against what's current. A boolean would
  // have to be cleared at the top of the effect that retries, and a
  // synchronous setState in an effect body is exactly the cascading-render
  // pattern react-hooks/set-state-in-effect rejects.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [failedRender, setFailedRender] = useState<string | null>(null);

  const {
    data: signedUrl,
    isPending: urlPending,
    isError: urlError,
  } = useQuery({
    queryKey: ["lecture-pdf-url", storagePath],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
    // Under react-query's defaults (staleTime 0, refetchOnWindowFocus true)
    // every window focus re-minted this URL. Supabase returns a fresh token
    // each call, so the string changed, which tore down the loaded document
    // and re-downloaded the entire PDF -- once per focus.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // The document is a disposable handle holding a worker connection, not
  // plain data, so this effect owns its whole lifecycle rather than a
  // useQuery: it has to be destroyed when the URL changes or the component
  // unmounts, and a cache that may hand the same proxy back afterwards
  // can't safely be the thing that decides when to do that.
  useEffect(() => {
    if (!signedUrl) return;
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ url: signedUrl });
    loadingTask.promise.then(
      (doc) => {
        if (!cancelled) setPdfDoc(doc);
      },
      () => {
        if (!cancelled) setFailedUrl(signedUrl);
      },
    );
    return () => {
      cancelled = true;
      setPdfDoc(null);
      // Destroys the document as well, and aborts the load if it's still in
      // flight.
      void loadingTask.destroy();
    };
  }, [signedUrl]);

  // The lower of what pdf.js parsed and what the server counted. The ink
  // endpoint refuses a write past the server's page_count, so navigating
  // past it would hand the user a page they can draw on but can't save. The
  // two agree for any PDF both can open; this just makes the disagreement
  // harmless instead of silently lossy.
  const numPages = pdfDoc ? Math.min(pdfDoc.numPages, pageCount) : 0;
  const renderKey = `${pageNumber}@${scale}`;
  const loadFailed =
    (signedUrl !== undefined && failedUrl === signedUrl) || failedRender === renderKey;

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        if (!cancelled) setViewportSize({ width: viewport.width, height: viewport.height });
      } catch (error) {
        // Cancelling in the cleanup below rejects the task's promise. That's
        // the expected path on a fast page/zoom change, not a failure.
        if ((error as { name?: string }).name === "RenderingCancelledException") return;
        if (!cancelled) setFailedRender(renderKey);
      }
    })();
    return () => {
      cancelled = true;
      // pdf.js tracks in-use canvases in a module-level set and throws
      // "Cannot use the same canvas during multiple render() operations" if
      // a second render starts before the first finishes or is cancelled.
      // Two quick Zoom or Next clicks was enough to leave the page blank.
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, scale, renderKey]);

  const { data: ink } = useQuery({
    queryKey: ["page-ink", documentId, pageNumber],
    queryFn: () => getBrowserApiClient().getPageInk(documentId, pageNumber),
  });

  const updateInkMutation = useMutation({
    mutationFn: (strokes: Stroke[]) =>
      getBrowserApiClient().updatePageInk(documentId, pageNumber, { strokes }),
    onSuccess: (result) => queryClient.setQueryData(["page-ink", documentId, pageNumber], result),
  });

  if (urlError || loadFailed) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load the lecture PDF.
      </p>
    );
  }

  if (urlPending || !pdfDoc) {
    return <p className="text-sm text-muted-foreground">Loading PDF...</p>;
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center gap-sm">
        <button
          type="button"
          onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
          disabled={pageNumber <= 1}
          className="rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-xs text-muted-foreground">
          Page {pageNumber} of {numPages}
        </span>
        <button
          type="button"
          onClick={() => setPageNumber((n) => Math.min(numPages, n + 1))}
          disabled={pageNumber >= numPages}
          className="rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted disabled:opacity-50"
        >
          Next
        </button>
        <div className="ml-md flex items-center gap-xs">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP))}
            disabled={scale <= MIN_SCALE}
            className="rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            Zoom out
          </button>
          <span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP))}
            disabled={scale >= MAX_SCALE}
            className="rounded-md border border-border px-sm py-xs text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            Zoom in
          </button>
        </div>
      </div>

      <div className="relative inline-block overflow-auto">
        <canvas ref={canvasRef} className="block" />
        {viewportSize && (
          <div className="absolute left-0 top-0">
            <DrawingCanvas
              strokes={ink?.strokes ?? []}
              onChange={(strokes) => updateInkMutation.mutate(strokes)}
              width={viewportSize.width}
              height={viewportSize.height}
              pageKey={pageNumber}
            />
          </div>
        )}
      </div>
    </div>
  );
}
