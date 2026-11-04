"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowLeftIcon, MinusIcon, MoonIcon, PlusIcon, SunIcon } from "@/components/icons";
import { NotchTabs } from "@/components/notch-tabs";
import { SegmentedSwitch } from "@/components/segmented-switch";
import { useTheme } from "@/lib/theme";
import { useMediaQuery, WIDE_QUERY } from "@/lib/use-media-query";

import type { LessonTab, LessonViewMode, TextScale } from "./lesson-tools";

export const LESSON_TABS = [
  { key: "lesson", label: "Lesson" },
  { key: "review", label: "Review" },
  { key: "quizzes", label: "Quizzes" },
  { key: "flashcards", label: "Flashcards" },
] as const satisfies readonly { key: LessonTab; label: string }[];

const VIEW_MODES = [
  { value: "pdf", label: "PDF" },
  { value: "text", label: "Text" },
] as const;

const DOT =
  "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-background p-0 text-sm font-bold text-foreground shadow-dot transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background";

/**
 * The lesson's top notch (design.md §4): tabs on a sliding pill, the round
 * "dots" either side of it. The lesson title rides in the notch as a compact
 * line whenever the page's own heading has scrolled away, so it is always
 * on screen and never shown twice.
 */
export function LessonTopNotch({
  tab,
  onTabChange,
  title,
  context,
  showTitle,
  backHref,
  textScale,
  onTextScale,
  viewMode,
  onViewMode,
  showViewMode,
  zoom,
}: {
  tab: LessonTab;
  onTabChange: (tab: LessonTab) => void;
  title: string;
  /** Muted prefix of the title line: where the lesson lives. */
  context: string | null;
  showTitle: boolean;
  backHref: string;
  textScale: TextScale;
  onTextScale: () => void;
  viewMode: LessonViewMode;
  onViewMode: (mode: LessonViewMode) => void;
  showViewMode: boolean;
  /** −/+ for PDF zoom, only in PDF mode. */
  zoom?: { onOut: () => void; onIn: () => void; percent: number };
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  return (
    <header className="pointer-events-none sticky top-[env(safe-area-inset-top,0px)] z-50 flex items-start justify-center gap-2.5">
      <div className="flex flex-1 justify-end gap-2 pt-2.5">
        {wide && <LeftDots backHref={backHref} textScale={textScale} onTextScale={onTextScale} />}
      </div>

      <NotchTabs
        tabs={LESSON_TABS}
        active={tab}
        onChange={onTabChange}
        label="Lesson sections"
        header={
          <div
            aria-hidden={!showTitle}
            className={`grid transition-[grid-template-rows,opacity] duration-[250ms] ${
              showTitle ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <p className="m-0 truncate overflow-hidden px-1 pt-0.5 text-center text-caption leading-[1.4] font-bold text-foreground">
              {context && <span className="text-muted-foreground">{context} · </span>}
              {title}
            </p>
          </div>
        }
      />

      <div className="flex flex-1 gap-2 pt-2.5">
        {wide && showViewMode && <ViewSwitch mode={viewMode} onChange={onViewMode} />}
        {wide && zoom && <ZoomDots {...zoom} />}
      </div>
    </header>
  );
}

/** Below 720px the side dots would collide with the notch, so they move
 * under the title instead (the design's `.mobile-dots`). */
export function LessonMobileDots({
  backHref,
  textScale,
  onTextScale,
  viewMode,
  onViewMode,
  showViewMode,
  zoom,
}: {
  backHref: string;
  textScale: TextScale;
  onTextScale: () => void;
  viewMode: LessonViewMode;
  onViewMode: (mode: LessonViewMode) => void;
  showViewMode: boolean;
  zoom?: { onOut: () => void; onIn: () => void; percent: number };
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  if (wide) return null;
  return (
    <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
      <LeftDots backHref={backHref} textScale={textScale} onTextScale={onTextScale} />
      {showViewMode && <ViewSwitch mode={viewMode} onChange={onViewMode} />}
      {zoom && <ZoomDots {...zoom} />}
    </div>
  );
}

function LeftDots({
  backHref,
  textScale,
  onTextScale,
}: {
  backHref: string;
  textScale: TextScale;
  onTextScale: () => void;
}) {
  const { resolved, setPreference } = useTheme();
  return (
    <div className="pointer-events-auto flex gap-2">
      <Link
        href={backHref}
        aria-label="Back to the library"
        title="Back to the library"
        className={DOT}
      >
        <ArrowLeftIcon />
      </Link>
      <button
        type="button"
        aria-label="Text size"
        title={`Text size: ${textScale}%`}
        onClick={onTextScale}
        className={DOT}
      >
        Aa
      </button>
      <button
        type="button"
        aria-label={resolved === "dark" ? "Light theme" : "Dark theme"}
        title={resolved === "dark" ? "Light theme" : "Dark theme"}
        onClick={() => setPreference(resolved === "dark" ? "light" : "dark", { persist: true })}
        className={DOT}
      >
        {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}

function ViewSwitch({
  mode,
  onChange,
}: {
  mode: LessonViewMode;
  onChange: (mode: LessonViewMode) => void;
}) {
  return (
    <SegmentedSwitch
      label="Lesson view mode"
      options={VIEW_MODES}
      value={mode}
      onChange={onChange}
      className="pointer-events-auto"
    />
  );
}

function ZoomDots({
  onOut,
  onIn,
  percent,
}: {
  onOut: () => void;
  onIn: () => void;
  percent: number;
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <ZoomButton label="Zoom out" onClick={onOut}>
        <MinusIcon />
      </ZoomButton>
      <span className="w-10 text-center text-caption font-bold text-muted-foreground tabular-nums">
        {percent}%
      </span>
      <ZoomButton label="Zoom in" onClick={onIn}>
        <PlusIcon />
      </ZoomButton>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={DOT}>
      {children}
    </button>
  );
}
