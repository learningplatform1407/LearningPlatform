"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Annotation, AnnotationCreateRequest } from "@lp/contracts";

import { useToast } from "@/components/toast";
import { questionElementId } from "@/components/question-bank-list";
import { findQuote } from "@/lib/text-offset";
import { scrollBehavior } from "@/lib/use-media-query";
import { getBrowserApiClient } from "@/lib/api-client.browser";

import { FlashcardsTab } from "./flashcards-tab";
import {
  colorName,
  nextTextScale,
  pickSwatch,
  TEXT_SCALES,
  toolAvailable,
  type BlockRange,
  type LessonTab,
  type LessonTool,
  type LessonViewMode,
  type SwatchIndex,
  type TextScale,
} from "./lesson-tools";
import { LESSON_TABS, LessonMobileDots, LessonTopNotch } from "./lesson-top-notch";
import { PdfLessonView, type PdfLessonHandle, type PdfOutlineItem } from "./pdf-lesson-view";
import { QuizzesTab } from "./quizzes-tab";
import { ReviewTab } from "./review-tab";
import { SidePanel, type SidePanelTab } from "./side-panel";
import { headingId, TextLessonView } from "./text-lesson-view";
import { TocDrawer, type TocHeading } from "./toc-drawer";
import { ToolNotch } from "./tool-notch";
import { useLessonKeys } from "./use-lesson-keys";
import { useTabSwipe } from "./use-tab-swipe";

const TEXT_SCALE_KEY = "lp-text-scale";
const UNDO_LIMIT = 80;
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 250, 300] as const;

/** One undoable change to this lesson's text annotations. Highlights have no
 * update endpoint, so every change is creations and deletions, and undoing
 * one is the reverse set. */
type UndoOp = { created: Annotation[]; removed: Annotation[] };

function readTextScale(): TextScale {
  try {
    const stored = Number(window.localStorage.getItem(TEXT_SCALE_KEY));
    return (TEXT_SCALES as readonly number[]).includes(stored) ? (stored as TextScale) : 100;
  } catch {
    return 100;
  }
}

function recreateRequest(annotation: Annotation): AnnotationCreateRequest {
  return {
    type: annotation.type,
    block_index: annotation.block_index,
    start_offset: annotation.start_offset,
    end_offset: annotation.end_offset,
    note_text: annotation.note_text,
    color: annotation.color,
  };
}

export default function LecturePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Lazy-initialized so a deep link like /learn/{id}?tab=review (e.g. from
  // the review dashboard) opens straight to that tab instead of always
  // starting on Lesson.
  // A visit from a checked question to the passages behind it.
  const [seeInLesson, setSeeInLesson] = useState<{
    questionId: string;
    quotes: string[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<LessonTab>(() => {
    const tabParam = searchParams.get("tab");
    return LESSON_TABS.some((tab) => tab.key === tabParam) ? (tabParam as LessonTab) : "lesson";
  });
  // Defaults to "text" -- the PDF/Text switch only renders when the lesson
  // has a *ready* lecture_pdf attached (see `readyLecturePdf` below).
  const [viewMode, setViewMode] = useState<LessonViewMode>("text");
  const [tool, setTool] = useState<LessonTool>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>("notebook");
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [textScale, setTextScale] = useState<TextScale>(() =>
    typeof window === "undefined" ? 100 : readTextScale(),
  );
  const [titleScrolledAway, setTitleScrolledAway] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const undoStack = useRef<UndoOp[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const pdfRef = useRef<PdfLessonHandle>(null);
  const [pdfCanUndo, setPdfCanUndo] = useState(false);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineItem[]>([]);
  const [zoom, setZoom] = useState(100);
  const handleOutline = useCallback((items: PdfOutlineItem[]) => setPdfOutline(items), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["documents", params.id],
    queryFn: () => getBrowserApiClient().getDocument(params.id),
  });

  const version = data?.current_version;
  const blocks = version?.status === "ready" ? (version.extracted_content?.blocks ?? []) : [];
  const sourcesByBlock = new Map<number, { start: number; end: number }[]>();
  for (const quote of seeInLesson?.quotes ?? []) {
    blocks.forEach((block, index) => {
      const found = block.type === "paragraph" ? findQuote(block.text ?? "", quote) : null;
      if (found) sourcesByBlock.set(index, [...(sourcesByBlock.get(index) ?? []), found]);
    });
  }
  // Only a PDF that actually processed is offered. `status` and
  // `error_message` used to be plumbed through the whole stack and read by
  // nobody, so a failed upload still rendered the toggle and dead-ended in
  // "Failed to load the lecture PDF." The admin who uploaded it sees the
  // real reason on the library page instead, where the upload happens.
  const readyLecturePdf = data?.lecture_pdf?.status === "ready" ? data.lecture_pdf : null;
  const mode: LessonViewMode = readyLecturePdf ? viewMode : "text";

  const { data: annotations = [] } = useQuery({
    queryKey: ["annotations", params.id],
    queryFn: () => getBrowserApiClient().listAnnotations(params.id),
    enabled: version?.status === "ready",
  });

  const createAnnotation = useMutation({
    mutationFn: (body: AnnotationCreateRequest) =>
      getBrowserApiClient().createAnnotation(params.id, body),
  });
  const updateAnnotation = useMutation({
    mutationFn: ({ id, note_text }: { id: string; note_text: string }) =>
      getBrowserApiClient().updateAnnotation(params.id, id, { note_text }),
  });
  const deleteAnnotation = useMutation({
    mutationFn: (annotationId: string) =>
      getBrowserApiClient().deleteAnnotation(params.id, annotationId),
  });

  /** Applies a set of deletions and creations, and returns what was created. */
  async function apply(remove: Annotation[], create: AnnotationCreateRequest[]) {
    try {
      await Promise.all(remove.map((a) => deleteAnnotation.mutateAsync(a.id)));
      return await Promise.all(create.map((body) => createAnnotation.mutateAsync(body)));
    } catch {
      toast("That change couldn't be saved.");
      return [];
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["annotations", params.id] });
    }
  }

  function pushUndo(op: UndoOp) {
    if (op.created.length === 0 && op.removed.length === 0) return;
    undoStack.current = [...undoStack.current.slice(-(UNDO_LIMIT - 1)), op];
    setUndoDepth(undoStack.current.length);
  }

  async function undo() {
    // PDF pages keep their own history (ink and highlights live per page).
    if (mode === "pdf") {
      if (!pdfRef.current?.undo()) toast("Nothing to undo.");
      return;
    }
    const op = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!op) {
      toast("Nothing to undo.");
      return;
    }
    await apply(op.created, op.removed.map(recreateRequest));
  }

  // -- Marking ---------------------------------------------------------

  async function handleMark(ranges: BlockRange[]) {
    if (ranges.length === 0 || !tool) return;

    if (tool.kind === "highlight") {
      const created = await apply(
        [],
        ranges.map((range) => ({
          type: "highlight" as const,
          block_index: range.blockIndex,
          start_offset: range.start,
          end_offset: range.end,
          color: colorName(tool.color),
        })),
      );
      pushUndo({ created, removed: [] });
      return;
    }

    if (tool.kind === "eraser") {
      // Erasing removes only the covered part of a highlight: the original
      // is deleted and whatever is left either side is recreated (there's
      // no update endpoint, so this is delete + recreate, not a resize).
      const removed: Annotation[] = [];
      const recreate: AnnotationCreateRequest[] = [];
      for (const range of ranges) {
        for (const a of annotations) {
          if (
            a.type !== "highlight" ||
            a.block_index !== range.blockIndex ||
            a.start_offset === null ||
            a.end_offset === null ||
            a.start_offset >= range.end ||
            a.end_offset <= range.start
          ) {
            continue;
          }
          removed.push(a);
          if (a.start_offset < range.start) {
            recreate.push({ ...recreateRequest(a), end_offset: range.start });
          }
          if (a.end_offset > range.end) {
            recreate.push({ ...recreateRequest(a), start_offset: range.end });
          }
        }
      }
      if (removed.length === 0) return;
      const created = await apply(removed, recreate);
      pushUndo({ created, removed });
      return;
    }

    if (tool.kind === "note") {
      // A note quotes one passage, so a drag across paragraphs anchors to
      // the first of them.
      const range = ranges[0]!;
      const [created] = await apply(
        [],
        [
          {
            type: "margin_note",
            block_index: range.blockIndex,
            start_offset: range.start,
            end_offset: range.end,
            note_text: null,
          },
        ],
      );
      setTool(null);
      if (created) {
        pushUndo({ created: [created], removed: [] });
        openNote(created.id);
      }
    }
  }

  // Annotations have no update endpoint, so editing a note's text replaces
  // the note, keeping its anchor.
  // Edited in place: the note keeps its id, so the panel stays on it.
  async function saveNoteText(note: Annotation, text: string) {
    try {
      await updateAnnotation.mutateAsync({ id: note.id, note_text: text });
    } catch {
      toast("That change couldn't be saved.");
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["annotations", params.id] });
    }
  }

  async function deleteNote(note: Annotation) {
    await apply([note], []);
    pushUndo({ created: [], removed: [note] });
  }

  function openNote(annotationId: string) {
    setFocusNoteId(annotationId);
    setPanelTab("notebook");
    setPanelOpen(true);
  }

  // -- "See in lesson" (design.md §12) ------------------------------------

  /** Moving between tabs by hand ends a "See in lesson" visit. */
  function changeTab(next: LessonTab) {
    setActiveTab(next);
    setSeeInLesson(null);
  }

  function showSources(questionId: string, quotes: string[]) {
    // Text mode first when the passage is in the text; otherwise the PDF,
    // which searches its own pages and reports back.
    const inText = blocks.some(
      (block) => block.type === "paragraph" && quotes.some((q) => findQuote(block.text ?? "", q)),
    );
    if (!inText && !readyLecturePdf) {
      toast("That passage isn't in this lesson any more.");
      return;
    }
    setSeeInLesson({ questionId, quotes });
    setTool(null);
    setActiveTab("lesson");
    setViewMode(inText ? "text" : "pdf");
    if (inText) {
      requestAnimationFrame(() => {
        const first = document.querySelector("[data-source]");
        if (!first) return;
        const y = first.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: y - window.innerHeight / 3, behavior: scrollBehavior() });
      });
    }
  }

  function backToQuizzes() {
    const questionId = seeInLesson?.questionId;
    setSeeInLesson(null);
    setActiveTab("quizzes");
    requestAnimationFrame(() =>
      document
        .getElementById(questionElementId(questionId ?? ""))
        ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }),
    );
  }

  function jumpToNote(note: Annotation) {
    setActiveTab("lesson");
    setViewMode("text");
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-annotation-id="${note.id}"]`)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: "center" }),
    );
  }

  // -- Tools -----------------------------------------------------------

  function chooseTool(kind: "pen" | "eraser" | "note") {
    if (!toolAvailable(kind, mode)) {
      toast(kind === "pen" ? "The pen draws on PDF pages." : "Notes work in Text mode.");
      return;
    }
    setTool((current) => {
      if (current?.kind === kind) return null;
      if (kind === "pen") {
        return { kind: "pen", color: current?.kind === "highlight" ? current.color : 1 };
      }
      return { kind };
    });
  }

  function chooseSwatch(color: SwatchIndex) {
    setTool((current) => pickSwatch(current, color));
  }

  function changeViewMode(next: LessonViewMode) {
    setViewMode(next);
    // A tool that doesn't exist in the other view is put down.
    setTool((current) => (current && !toolAvailable(current.kind, next) ? null : current));
  }

  function cycleTextScale() {
    const next = nextTextScale(textScale);
    setTextScale(next);
    toast(`Text size ${next}%`);
    try {
      window.localStorage.setItem(TEXT_SCALE_KEY, String(next));
    } catch {
      // Storage blocked: the size just won't be remembered.
    }
  }

  // Swiping stays off while a tool is armed: on the Lesson tab a sideways
  // drag is marking, not navigating (design.md §13).
  useTabSwipe(!(activeTab === "lesson" && tool !== null), (direction) => {
    const index = LESSON_TABS.findIndex((tab) => tab.key === activeTab) + direction;
    const next = LESSON_TABS[index];
    if (next) changeTab(next.key);
  });

  useLessonKeys(activeTab === "lesson", {
    swatch: chooseSwatch,
    toggleMarker: () =>
      setTool((current) =>
        current?.kind === "highlight" ? null : { kind: "highlight", color: 0 },
      ),
    eraser: () => chooseTool("eraser"),
    pen: () => chooseTool("pen"),
    note: () => chooseTool("note"),
    explain: () => toast("AI explanations are coming soon."),
    undo: () => void undo(),
    clear: () => setTool(null),
  });

  // -- Scroll-linked state ----------------------------------------------

  // In PDF mode the book's own outline (if it has one) is the contents.
  const headings: TocHeading[] =
    mode === "text"
      ? blocks.flatMap((block, index) =>
          block.type === "heading" && block.text
            ? [{ id: headingId(index), label: block.text }]
            : [],
        )
      : pdfOutline.map((item) => ({ id: item.id, label: item.label }));
  const headingKey = headings.map((h) => h.id).join(",");

  // The title line appears in the top notch once the page's own h1 has
  // scrolled up and away.
  useEffect(() => {
    const title = titleRef.current;
    if (!title || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setTitleScrolledAway(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(title);
    return () => observer.disconnect();
  }, [isPending]);

  // Scroll-spy: the current heading is the last one above the top third.
  useEffect(() => {
    if (activeTab !== "lesson" || !headingKey) return;
    function spy() {
      let current: string | null = null;
      for (const id of headingKey.split(",")) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= window.innerHeight * 0.3) {
          current = id;
        }
      }
      setActiveHeadingId(current);
    }
    spy();
    window.addEventListener("scroll", spy, { passive: true });
    return () => window.removeEventListener("scroll", spy);
  }, [activeTab, headingKey]);

  function jumpToHeading(id: string) {
    setActiveTab("lesson");
    if (mode === "pdf") pdfRef.current?.jumpTo(id);
    else
      document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    if (!window.matchMedia("(min-width: 721px)").matches) setTocOpen(false);
  }

  if (isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load lecture: {(error as Error).message}
        </p>
      </main>
    );
  }

  const subChapter = data.sub_chapter;
  const backHref = subChapter ? `/learn/library/${subChapter.chapter.book_id}` : "/learn/library";
  const tabLabel = LESSON_TABS.find((t) => t.key === activeTab)!.label;
  const dotsProps = {
    backHref,
    textScale,
    onTextScale: cycleTextScale,
    viewMode: mode,
    onViewMode: changeViewMode,
    showViewMode: activeTab === "lesson" && readyLecturePdf !== null,
    zoom:
      activeTab === "lesson" && mode === "pdf"
        ? {
            percent: zoom,
            onOut: () => setZoom((z) => ZOOM_STEPS.findLast((step) => step < z) ?? z),
            onIn: () => setZoom((z) => ZOOM_STEPS.find((step) => step > z) ?? z),
          }
        : undefined,
  };

  return (
    // Narrow screens get 50px gutters so the edge notches never cover text.
    <div className="min-h-screen px-[max(16px,env(safe-area-inset-left,0px))] pb-[140px] max-[720px]:px-[50px]">
      <LessonTopNotch
        tab={activeTab}
        onTabChange={changeTab}
        title={data.title}
        context={subChapter?.title ?? null}
        showTitle={titleScrolledAway}
        {...dotsProps}
      />

      {seeInLesson && activeTab === "lesson" && (
        <button
          type="button"
          onClick={backToQuizzes}
          className="fixed top-[72px] left-1/2 z-[52] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background shadow-notch"
        >
          ← Back to quizzes
        </button>
      )}

      <ToolNotch
        tool={tool}
        viewMode={mode}
        onLessonTab={activeTab === "lesson"}
        canUndo={mode === "pdf" ? pdfCanUndo : undoDepth > 0}
        tocOpen={tocOpen}
        onToggleToc={() => setTocOpen((open) => !open)}
        onSwatch={chooseSwatch}
        onTool={chooseTool}
        onUndo={() => void undo()}
      />

      <TocDrawer
        open={tocOpen}
        title={data.title}
        headings={headings}
        activeHeadingId={activeHeadingId}
        onJump={jumpToHeading}
        scopeId={subChapter?.id ?? "none"}
        currentDocumentId={params.id}
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        tab={panelTab}
        onTabChange={setPanelTab}
        documentId={params.id}
        lessonTitle={data.title}
        blocks={blocks}
        annotations={annotations}
        focusNoteId={focusNoteId}
        onJumpToNote={jumpToNote}
        onDeleteNote={(note) => void deleteNote(note)}
        onSaveNoteText={(note, text) => void saveNoteText(note, text)}
      />

      <main
        className={`mx-auto w-full ${
          activeTab === "lesson" && mode === "pdf" ? "max-w-[57.5rem]" : "max-w-[47.5rem]"
        }`}
      >
        <header className="pt-[30px] pb-1.5">
          <p className="m-0 text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
            {subChapter ? (
              <>
                <Link
                  href={`/learn/library/${subChapter.chapter.book_id}/${subChapter.chapter.id}`}
                  className="hover:text-foreground hover:underline"
                >
                  {subChapter.chapter.title}
                </Link>
                {" · "}
                {subChapter.title}
              </>
            ) : (
              tabLabel
            )}
          </p>
          <h1
            ref={titleRef}
            className="mt-1.5 mb-1 text-[clamp(26px,4vw,34px)] leading-[1.15] font-extrabold"
          >
            {data.title}
          </h1>
          <LessonMobileDots {...dotsProps} />
        </header>

        <div className="mt-md">
          {activeTab === "review" && <ReviewTab documentId={params.id} textScale={textScale} />}
          {/* Kept mounted (hidden) during a "See in lesson" visit, so the
              back bar returns to the question with its answer still shown. */}
          {(activeTab === "quizzes" || seeInLesson) && (
            <div hidden={activeTab !== "quizzes"}>
              <QuizzesTab documentId={params.id} onSeeInLesson={showSources} />
            </div>
          )}
          {activeTab === "flashcards" && <FlashcardsTab documentId={params.id} />}

          {activeTab === "lesson" && mode === "pdf" && readyLecturePdf && (
            <PdfLessonView
              ref={pdfRef}
              documentId={params.id}
              storagePath={readyLecturePdf.storage_path}
              pageCount={readyLecturePdf.page_count}
              tool={tool}
              zoom={zoom}
              onUndoChange={setPdfCanUndo}
              onOutline={handleOutline}
              sourceQuotes={seeInLesson?.quotes ?? null}
              onSourcesShown={(found) => {
                if (!found) toast("That passage isn't in this lesson any more.");
              }}
            />
          )}

          {activeTab === "lesson" && mode === "text" && (
            <>
              {!version && <p className="text-sm text-muted-foreground">Not processed yet.</p>}
              {version?.status === "processing" && (
                <p className="text-sm text-muted-foreground">Processing...</p>
              )}
              {version?.status === "failed" && (
                <p role="alert" className="text-sm text-danger">
                  Processing failed: {version.error_message ?? "Unknown error"}
                </p>
              )}
              {version?.status === "ready" && (
                <TextLessonView
                  blocks={blocks}
                  annotations={annotations}
                  tool={tool}
                  textScale={textScale}
                  onMark={(ranges) => void handleMark(ranges)}
                  onOpenNote={openNote}
                  sources={sourcesByBlock}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
