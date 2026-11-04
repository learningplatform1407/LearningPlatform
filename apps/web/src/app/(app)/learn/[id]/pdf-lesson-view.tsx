"use client";

import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { LessonPageInk, PageHighlight, Stroke, StrokePoint } from "@lp/contracts";
import { highlightIndex, pageColors } from "@lp/ui";

import { useToast } from "@/components/toast";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { createClient } from "@/lib/supabase/client";

import { colorName, type LessonTool } from "./lesson-tools";
import {
  highlightHit,
  rectsForRange,
  strokeHit,
  strokePath,
  wordAt,
  wordsFromTextItems,
  type PageWord,
} from "./pdf-geometry";

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

// pdf.js range-fetches the file lazily for the whole life of the document,
// not just during the initial load, so this URL has to outlive the reading
// session -- on a shorter TTL an expired token surfaces hours in as pages
// that silently refuse to render. Paired with `staleTime: Infinity` below so
// exactly one URL is minted per mount and never swapped out from under a
// document that's already loaded.
const SIGNED_URL_TTL_SECONDS = 8 * 60 * 60;

/** Pages within this distance of the viewport are rendered; further ones
 * release their canvas, so a 400-page book doesn't hold 400 bitmaps. */
const RENDER_MARGIN = "1200px 0px";

const UNDO_LIMIT = 80;
const TWO_FINGER_TAP_MS = 380;
const TWO_FINGER_TAP_SLOP = 10;
/** Pen width in PDF points (design.md §10), converted per page. */
const PEN_POINTS = 1.3;
const ERASER_POINTS = 4;

type PageInk = Pick<LessonPageInk, "strokes" | "highlights">;
const EMPTY_INK: PageInk = { strokes: [], highlights: [] };

export interface PdfOutlineItem {
  id: string;
  label: string;
  page: number;
  /** Where on the page the heading sits, [0, 1] from the top, if known. */
  y: number | null;
}

export interface PdfLessonHandle {
  /** Reverts the last change to any page; false when there's none. */
  undo: () => boolean;
  jumpTo: (outlineId: string) => void;
}

interface PdfLessonViewProps {
  documentId: string;
  storagePath: string;
  /** The server's own page count for this PDF, from `lecture_pdf`. */
  pageCount: number;
  tool?: LessonTool;
  /** Page width as a percentage of the reading column. */
  zoom?: number;
  onUndoChange?: (canUndo: boolean) => void;
  onOutline?: (items: PdfOutlineItem[]) => void;
  ref?: Ref<PdfLessonHandle>;
}

/**
 * The lecture PDF as a continuous column of book pages (design.md §8): each
 * a white sheet with a soft shadow, the ink and highlights drawn straight
 * on it, inverted as one unit in dark mode.
 */
export function PdfLessonView({
  documentId,
  storagePath,
  pageCount,
  tool = null,
  zoom = 100,
  onUndoChange,
  onOutline,
  ref,
}: PdfLessonViewProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const columnRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [firstAspect, setFirstAspect] = useState(1.414);
  // Both failures record *what* failed rather than a bare boolean, so each is
  // derived by comparing against what's current -- a boolean would need
  // clearing in the retrying effect's body, which react-hooks rejects.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ page: number; y: number; at: number } | null>(null);
  const undoStack = useRef<{ page: number; before: PageInk }[]>([]);
  const outlineRef = useRef<PdfOutlineItem[]>([]);
  // Once a stylus has touched any page, fingers only scroll (design.md §10).
  const [penSeen, setPenSeen] = useState(false);
  const markPenSeen = useCallback(() => setPenSeen(true), []);

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
  // unmounts, and a cache that may hand the same proxy back afterwards can't
  // safely be the thing that decides when to do that.
  useEffect(() => {
    if (!signedUrl) return;
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ url: signedUrl });
    loadingTask.promise.then(
      async (doc) => {
        if (cancelled) return;
        const first = await doc.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setFirstAspect(viewport.height / viewport.width);
        setPdfDoc(doc);
      },
      () => {
        if (!cancelled) setFailedUrl(signedUrl);
      },
    );
    return () => {
      cancelled = true;
      setPdfDoc(null);
      // Destroys the document as well, and aborts the load if still in flight.
      void loadingTask.destroy();
    };
  }, [signedUrl]);

  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setColumnWidth(entry.contentRect.width);
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, [pdfDoc]);

  // The PDF's own outline feeds the table of contents in PDF mode.
  useEffect(() => {
    if (!pdfDoc || !onOutline) return;
    let cancelled = false;
    void outlineOf(pdfDoc).then((items) => {
      if (cancelled) return;
      outlineRef.current = items;
      onOutline(items);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, onOutline]);

  const save = useCallback(
    async (page: number, ink: PageInk) => {
      const key = ["page-ink", documentId, page];
      queryClient.setQueryData(key, ink);
      try {
        const saved = await getBrowserApiClient().updatePageInk(documentId, page, ink);
        queryClient.setQueryData(key, saved);
      } catch {
        toast("That change couldn't be saved.");
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [documentId, queryClient, toast],
  );

  const edit = useCallback(
    (page: number, before: PageInk, after: PageInk) => {
      undoStack.current = [...undoStack.current.slice(-(UNDO_LIMIT - 1)), { page, before }];
      onUndoChange?.(true);
      void save(page, after);
    },
    [save, onUndoChange],
  );

  const undo = useCallback(() => {
    const last = undoStack.current.pop();
    onUndoChange?.(undoStack.current.length > 0);
    if (!last) return false;
    void save(last.page, last.before);
    return true;
  }, [save, onUndoChange]);

  useImperativeHandle(
    ref,
    () => ({
      undo,
      jumpTo: (outlineId) => {
        const item = outlineRef.current.find((o) => o.id === outlineId);
        if (!item) return;
        const page = document.getElementById(pageElementId(item.page));
        if (!page) return;
        const y = page.getBoundingClientRect().top + window.scrollY;
        const offset = item.y === null ? 0 : item.y * page.offsetHeight;
        window.scrollTo({ top: y + offset - window.innerHeight / 3, behavior: "smooth" });
        if (item.y !== null) setFlash({ page: item.page, y: item.y, at: Date.now() });
      },
    }),
    [undo],
  );

  const loadFailed = signedUrl !== undefined && failedUrl === signedUrl;

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

  // The lower of what pdf.js parsed and what the server counted. The ink
  // endpoint refuses a write past the server's page_count, so offering a
  // page beyond it would mean drawing that can't be saved.
  const numPages = Math.min(pdfDoc.numPages, pageCount);
  const pageWidth = Math.round((columnWidth * zoom) / 100);

  return (
    // Zoomed past the column, the pages scroll sideways inside it rather
    // than pushing the whole page wider.
    <div ref={columnRef} className="w-full overflow-x-auto">
      {pageWidth > 0 &&
        Array.from({ length: numPages }, (_, i) => (
          <PdfPage
            key={i + 1}
            pdfDoc={pdfDoc}
            documentId={documentId}
            pageNumber={i + 1}
            width={pageWidth}
            defaultAspect={firstAspect}
            tool={tool}
            penSeen={penSeen}
            onPenSeen={markPenSeen}
            flashY={flash?.page === i + 1 ? flash : null}
            onEdit={edit}
            onUndo={undo}
          />
        ))}
    </div>
  );
}

function pageElementId(page: number) {
  return `pdf-page-${page}`;
}

async function outlineOf(doc: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline) return [];
  const items: PdfOutlineItem[] = [];
  // Two levels: chapters and their sections. Deeper trees make a TOC drawer
  // too long to scan.
  const walk = async (nodes: typeof outline, depth: number) => {
    for (const node of nodes) {
      try {
        const dest =
          typeof node.dest === "string" ? await doc.getDestination(node.dest) : node.dest;
        if (dest && dest[0]) {
          const pageIndex = await doc.getPageIndex(
            dest[0] as Parameters<PDFDocumentProxy["getPageIndex"]>[0],
          );
          const page = await doc.getPage(pageIndex + 1);
          const [, , , pageTop] = page.view;
          // XYZ destinations carry the top in PDF units, measured from the
          // bottom of the page.
          const top = dest[1] && (dest[1] as { name?: string }).name === "XYZ" ? dest[3] : null;
          items.push({
            id: `outline-${items.length}`,
            label: node.title,
            page: pageIndex + 1,
            y:
              typeof top === "number" && pageTop
                ? Math.min(1, Math.max(0, 1 - top / pageTop))
                : null,
          });
        }
      } catch {
        // An outline entry pointing nowhere is skipped, not fatal.
      }
      if (depth < 1 && node.items.length > 0) await walk(node.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return items;
}

interface Gesture {
  kind: "pen" | "highlight" | "eraser";
  pointerId: number;
  before: PageInk;
  points: StrokePoint[];
  width: number;
  anchor: PageWord | null;
  current: PageWord | null;
  erased: PageInk | null;
}

function PdfPage({
  pdfDoc,
  documentId,
  pageNumber,
  width,
  defaultAspect,
  tool,
  penSeen,
  onPenSeen,
  flashY,
  onEdit,
  onUndo,
}: {
  pdfDoc: PDFDocumentProxy;
  documentId: string;
  pageNumber: number;
  width: number;
  defaultAspect: number;
  tool: LessonTool;
  penSeen: boolean;
  onPenSeen: () => void;
  flashY: { y: number; at: number } | null;
  onEdit: (page: number, before: PageInk, after: PageInk) => void;
  onUndo: () => boolean;
}) {
  const toast = useToast();
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [words, setWords] = useState<PageWord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<{ points: StrokePoint[]; width: number } | null>(null);
  const [preview, setPreview] = useState<PageHighlight["rects"] | null>(null);
  const [erasing, setErasing] = useState<PageInk | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number; at: number }>());
  const twoFinger = useRef<{ at: number; moved: boolean } | null>(null);

  const viewport = page?.getViewport({ scale: 1 });
  const aspect = viewport ? viewport.height / viewport.width : defaultAspect;
  const height = Math.round(width * aspect);
  const pointsWide = viewport?.width ?? 600;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      {
        rootMargin: RENDER_MARGIN,
      },
    );
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near || page) return;
    let cancelled = false;
    void pdfDoc.getPage(pageNumber).then((loaded) => {
      if (!cancelled) setPage(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [near, page, pdfDoc, pageNumber]);

  // Render at device resolution; release the bitmap when scrolled far away.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;
    if (!near) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const scaled = page.getViewport({
      scale: (width * ratio) / page.getViewport({ scale: 1 }).width,
    });
    canvas.width = Math.floor(scaled.width);
    canvas.height = Math.floor(scaled.height);
    let renderTask: RenderTask | null = page.render({ canvas, viewport: scaled });
    renderTask.promise.catch((error: { name?: string }) => {
      // Cancelling in the cleanup below rejects the task's promise. That's
      // the expected path on a fast zoom or scroll, not a failure.
      if (error?.name !== "RenderingCancelledException") setFailed(true);
    });
    return () => {
      // pdf.js tracks in-use canvases in a module-level set and throws
      // "Cannot use the same canvas during multiple render() operations" if
      // a second render starts before the first finishes or is cancelled.
      renderTask?.cancel();
      renderTask = null;
    };
  }, [page, near, width]);

  // Word boxes, for word-level highlighting. Loaded once per page.
  useEffect(() => {
    if (!near || !page || words) return;
    let cancelled = false;
    const base = page.getViewport({ scale: 1 });
    void page.getTextContent().then((content) => {
      if (cancelled) return;
      const items = content.items.flatMap((item) =>
        "str" in item
          ? [
              {
                str: item.str,
                transform: pdfjsLib.Util.transform(base.transform, item.transform),
                width: item.width,
              },
            ]
          : [],
      );
      setWords(wordsFromTextItems(items, base.width, base.height));
    });
    return () => {
      cancelled = true;
    };
  }, [near, page, words]);

  const { data: ink = EMPTY_INK } = useQuery({
    queryKey: ["page-ink", documentId, pageNumber],
    queryFn: () => getBrowserApiClient().getPageInk(documentId, pageNumber),
    enabled: near,
  });

  function pointOf(event: { clientX: number; clientY: number }): StrokePoint {
    const rect = sheetRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function eraseAt(base: PageInk, point: StrokePoint): PageInk {
    const radius = ERASER_POINTS / pointsWide;
    return {
      strokes: base.strokes.filter((s) => !strokeHit(s, point.x, point.y, radius, aspect)),
      highlights: base.highlights.filter((h) => !highlightHit(h, point.x, point.y)),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!tool || tool.kind === "note") return;
    const { pointerType } = event;
    if (pointerType === "pen" && !penSeen) onPenSeen();

    if (pointerType === "touch") {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY, at: Date.now() });
      // A second finger within the tap window: this is a two-finger tap
      // (undo), not a stroke -- drop whatever the first finger started.
      if (touches.current.size === 2) {
        const first = [...touches.current.values()][0]!;
        if (Date.now() - first.at < TWO_FINGER_TAP_MS) {
          twoFinger.current = { at: first.at, moved: false };
          gesture.current = null;
          setDraft(null);
          setPreview(null);
          setErasing(null);
        }
        return;
      }
      // Once a stylus has been seen, fingers only scroll.
      if (penSeen) return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointOf(event);
    const before = { strokes: ink.strokes, highlights: ink.highlights };

    if (tool.kind === "pen") {
      const pressure = pointerType === "pen" && event.pressure > 0 ? event.pressure : null;
      const widthPoints = pressure === null ? PEN_POINTS : 1 + pressure * 0.7;
      const width = widthPoints / pointsWide;
      gesture.current = {
        kind: "pen",
        pointerId: event.pointerId,
        before,
        points: [point],
        width,
        anchor: null,
        current: null,
        erased: null,
      };
      setDraft({ points: [point], width });
      return;
    }

    if (tool.kind === "eraser") {
      const erased = eraseAt(before, point);
      gesture.current = {
        kind: "eraser",
        pointerId: event.pointerId,
        before,
        points: [],
        width: 0,
        anchor: null,
        current: null,
        erased,
      };
      setErasing(erased);
      return;
    }

    if (!words || words.length === 0) {
      toast(words ? "There's no text on this page to highlight." : "Still reading this page...");
      return;
    }
    const word = wordAt(words, point.x, point.y);
    if (!word) return;
    gesture.current = {
      kind: "highlight",
      pointerId: event.pointerId,
      before,
      points: [],
      width: 0,
      anchor: word,
      current: word,
      erased: null,
    };
    setPreview(rectsForRange(words, word.index, word.index));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" && twoFinger.current) {
      const start = touches.current.get(event.pointerId);
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > TWO_FINGER_TAP_SLOP
      ) {
        twoFinger.current.moved = true;
      }
      return;
    }
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // Coalesced events keep fast strokes smooth: the browser batches pointer
    // moves per frame, and the batch holds every sample in between.
    const native = event.nativeEvent as PointerEvent;
    const samples = native.getCoalescedEvents?.() ?? [native];

    if (current.kind === "pen") {
      for (const sample of samples.length ? samples : [native])
        current.points.push(pointOf(sample));
      setDraft({ points: [...current.points], width: current.width });
    } else if (current.kind === "eraser" && current.erased) {
      let next = current.erased;
      for (const sample of samples.length ? samples : [native])
        next = eraseAt(next, pointOf(sample));
      if (next !== current.erased) {
        current.erased = next;
        setErasing(next);
      }
    } else if (current.kind === "highlight" && words && current.anchor) {
      const point = pointOf(event);
      const word = wordAt(words, point.x, point.y);
      if (word && word.index !== current.current?.index) {
        current.current = word;
        setPreview(rectsForRange(words, current.anchor.index, word.index));
      }
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      touches.current.delete(event.pointerId);
      const tap = twoFinger.current;
      if (tap && touches.current.size === 0) {
        twoFinger.current = null;
        if (!tap.moved && Date.now() - tap.at < TWO_FINGER_TAP_MS && !onUndo()) {
          toast("Nothing to undo.");
        }
        return;
      }
    }
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;

    if (current.kind === "pen") {
      setDraft(null);
      if (!tool || tool.kind !== "pen") return;
      const stroke: Stroke = {
        color: pageColors.pens[tool.color],
        width: current.width,
        points: current.points,
      };
      onEdit(pageNumber, current.before, {
        strokes: [...current.before.strokes, stroke],
        highlights: current.before.highlights,
      });
    } else if (current.kind === "eraser") {
      setErasing(null);
      const after = current.erased;
      // A gesture that changed nothing isn't recorded (design.md §10).
      if (
        after &&
        (after.strokes.length !== current.before.strokes.length ||
          after.highlights.length !== current.before.highlights.length)
      ) {
        onEdit(pageNumber, current.before, after);
      }
    } else if (current.kind === "highlight" && words && current.anchor && current.current) {
      setPreview(null);
      if (!tool || tool.kind !== "highlight") return;
      const rects = rectsForRange(words, current.anchor.index, current.current.index);
      if (rects.length === 0) return;
      onEdit(pageNumber, current.before, {
        strokes: current.before.strokes,
        highlights: [...current.before.highlights, { color: colorName(tool.color), rects }],
      });
    }
  }

  const shown = erasing ?? ink;
  const marking = tool !== null && tool.kind !== "note";

  return (
    <div
      id={pageElementId(pageNumber)}
      ref={sheetRef}
      role="img"
      aria-label={`Page ${pageNumber}`}
      style={{ width, height }}
      className="book-page relative mx-auto mb-md bg-white shadow-page select-none [-webkit-touch-callout:none]"
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-[#c8372d]">
          This page couldn&apos;t be drawn.
        </p>
      )}

      {/* Highlights, then ink, positioned in page units so they scale with
          the page for free. */}
      <div className="pointer-events-none absolute inset-0">
        {shown.highlights.map((highlight, h) =>
          highlight.rects.map(([x0, y0, x1, y1], r) => (
            <i
              key={`${h}-${r}`}
              className={`absolute rounded-[1px] mix-blend-multiply ${HIGHLIGHT_FILL[highlightIndex(highlight.color)]}`}
              style={rectStyle(x0, y0, x1, y1)}
            />
          )),
        )}
        {preview?.map(([x0, y0, x1, y1], r) => (
          <i
            key={`p${r}`}
            className="absolute rounded-[1px] bg-[rgba(47,111,159,0.16)]"
            style={rectStyle(x0, y0, x1, y1)}
          />
        ))}
        {flashY && (
          <i
            key={flashY.at}
            className="absolute right-[4%] left-[4%] h-[3%] animate-[heading-flash_1.6s_ease_forwards] rounded-[3px] bg-[rgba(255,200,0,0.5)]"
            style={{ top: `${Math.max(0, flashY.y * 100 - 1)}%` }}
          />
        )}
      </div>

      <svg
        viewBox={`0 0 1000 ${1000 * aspect}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {shown.strokes.map((stroke, i) => (
          <path
            key={i}
            d={strokePath(stroke.points, 1000, 1000 * aspect)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width * 1000}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {draft && tool?.kind === "pen" && (
          <path
            d={strokePath(draft.points, 1000, 1000 * aspect)}
            fill="none"
            stroke={pageColors.pens[tool.color]}
            strokeWidth={draft.width * 1000}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {marking && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          // Until a stylus shows up, a finger draws, so the page mustn't
          // scroll under it; after that, fingers scroll and only the pen draws.
          style={{ touchAction: penSeen ? "pan-x pan-y pinch-zoom" : "none" }}
          className="absolute inset-0 cursor-crosshair"
        />
      )}
    </div>
  );
}

const HIGHLIGHT_FILL = [
  "bg-highlight0",
  "bg-highlight1",
  "bg-highlight2",
  "bg-highlight3",
  "bg-highlight4",
] as const;

function rectStyle(x0: number, y0: number, x1: number, y1: number): React.CSSProperties {
  return {
    left: `${x0 * 100}%`,
    top: `${y0 * 100}%`,
    width: `${(x1 - x0) * 100}%`,
    height: `${(y1 - y0) * 100}%`,
  };
}
