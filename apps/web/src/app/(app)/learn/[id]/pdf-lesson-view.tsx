"use client";

import * as pdfjsLib from "pdfjs-dist";
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

interface PdfLessonViewProps {
  documentId: string;
  storagePath: string;
}

export function PdfLessonView({ documentId, storagePath }: PdfLessonViewProps) {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);

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
        .createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const {
    data: pdfDoc,
    isPending: docPending,
    isError: docError,
  } = useQuery({
    queryKey: ["lecture-pdf-doc", signedUrl],
    queryFn: () => pdfjsLib.getDocument({ url: signedUrl }).promise,
    enabled: !!signedUrl,
    // The document proxy is a long-lived handle holding a worker
    // connection, not plain data -- never treat it as stale and refetch it.
    staleTime: Infinity,
  });

  const numPages = pdfDoc?.numPages ?? 0;

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    void (async () => {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      if (!cancelled) setViewportSize({ width: viewport.width, height: viewport.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, scale]);

  const { data: ink } = useQuery({
    queryKey: ["page-ink", documentId, pageNumber],
    queryFn: () => getBrowserApiClient().getPageInk(documentId, pageNumber),
  });

  const updateInkMutation = useMutation({
    mutationFn: (strokes: Stroke[]) =>
      getBrowserApiClient().updatePageInk(documentId, pageNumber, { strokes }),
    onSuccess: (result) => queryClient.setQueryData(["page-ink", documentId, pageNumber], result),
  });

  if (urlError || docError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Failed to load the lecture PDF.
      </p>
    );
  }

  if (urlPending || docPending || !pdfDoc) {
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
