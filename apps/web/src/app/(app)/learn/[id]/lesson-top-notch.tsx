"use client";

import type { MessageKey } from "@lp/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowLeftIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { NotchTabs } from "@/components/notch-tabs";
import { SegmentedSwitch } from "@/components/segmented-switch";
import { useMediaQuery, WIDE_QUERY } from "@/lib/use-media-query";
import { useI18n } from "@/lib/i18n";

import type { LessonTab, LessonViewMode } from "./lesson-tools";

/** `label` is the tab's catalogue key; translate it where it's shown. */
export const LESSON_TABS = [
  { key: "lesson", label: "lesson.tabs.lesson" },
  { key: "review", label: "lesson.tabs.review" },
  { key: "quizzes", label: "lesson.tabs.quizzes" },
  { key: "flashcards", label: "lesson.tabs.flashcards" },
] as const satisfies readonly { key: LessonTab; label: MessageKey }[];

const VIEW_MODES = [
  { value: "text", label: "lesson.text" },
  { value: "pdf", label: "lesson.pdf" },
] as const;

const DOT =
  "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-background p-0 text-sm font-bold text-foreground shadow-dot transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background";

/** How tall the outer shell is: enough to hold a 38px dot at the same
 * offset the dots had before it existed, and to sit a little below the tabs
 * notch nested in it. The notch grows past it when the title line appears,
 * which is the point -- it is on top, not inside a box. */
const SHELL_HEIGHT = 68;

/**
 * The lesson's top notch (design.md §4): tabs on a sliding pill, the round
 * "dots" either side of it. The lesson title rides in the notch as a compact
 * line whenever the page's own heading has scrolled away, so it is always
 * on screen and never shown twice.
 *
 * On wide screens the dots and the tabs sit in one notch within a notch:
 * an outer shell of the same shape runs behind the dots and under the tabs
 * notch, which keeps its own border and shadow so it reads as sitting on
 * the shell. The dots do not move to get this -- the shell is painted
 * behind them, at the width the cluster already occupied.
 */
export function LessonTopNotch({
  tab,
  onTabChange,
  title,
  context,
  showTitle,
  backHref,
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
  viewMode: LessonViewMode;
  onViewMode: (mode: LessonViewMode) => void;
  showViewMode: boolean;
  /** −/+ for PDF zoom, only in PDF mode. */
  zoom?: { onOut: () => void; onIn: () => void; percent: number };
}) {
  const { t } = useI18n();
  const wide = useMediaQuery(WIDE_QUERY);
  return (
    <header className="pointer-events-none sticky top-[env(safe-area-inset-top,0px)] z-50 flex justify-center">
      {/* Bounded so the dots stay beside the notch on a wide screen rather
          than drifting out to the window's edges -- which is where the
          flex-1 columns put them before, and what the shell has to span.
          Below this width the columns shrink exactly as they did. */}
      <div className="relative flex w-[min(980px,100%)] items-start gap-2.5">
        {/* The same material as the tabs notch inside it -- page tone, one
            rule, the same bottom radius and shadow -- just wide enough to
            hold the dots as well. Opaque, because this is chrome the lesson
            scrolls under: a tinted panel let the text show through it. */}
        {wide && (
          <span
            aria-hidden="true"
            style={{ height: SHELL_HEIGHT }}
            className="absolute inset-x-0 top-0 rounded-b-notch border border-t-0 border-border bg-background shadow-notch"
          />
        )}

        <div className="relative flex flex-1 justify-end gap-2 pt-2.5">
          {wide && <BackDot href={backHref} />}
        </div>

        <NotchTabs
          tabs={LESSON_TABS.map((entry) => ({ ...entry, label: t(entry.label) }))}
          active={tab}
          onChange={onTabChange}
          label={t("lesson.sections")}
          header={
            <div
              aria-hidden={!showTitle}
              className={`grid transition-[grid-template-rows,opacity] duration-[250ms] ${
                showTitle ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <p className="m-0 truncate overflow-hidden px-1 pt-1 pb-0.5 text-center text-base leading-[1.35] font-extrabold text-foreground">
                {context && <span className="text-muted-foreground">{context} · </span>}
                {title}
              </p>
            </div>
          }
        />

        <div className="relative flex flex-1 gap-2 pt-2.5">
          {wide && showViewMode && <ViewSwitch mode={viewMode} onChange={onViewMode} />}
          {wide && zoom && <ZoomDots {...zoom} />}
        </div>
      </div>
    </header>
  );
}

/** Below 720px the side dots would collide with the notch, so they move
 * under the title instead (the design's `.mobile-dots`). */
export function LessonMobileDots({
  backHref,
  viewMode,
  onViewMode,
  showViewMode,
  zoom,
}: {
  backHref: string;
  viewMode: LessonViewMode;
  onViewMode: (mode: LessonViewMode) => void;
  showViewMode: boolean;
  zoom?: { onOut: () => void; onIn: () => void; percent: number };
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  if (wide) return null;
  return (
    <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
      <BackDot href={backHref} />
      {showViewMode && <ViewSwitch mode={viewMode} onChange={onViewMode} />}
      {zoom && <ZoomDots {...zoom} />}
    </div>
  );
}

/** Back to the lesson's place in the library. Text size lives in the tool
 * notch, and the theme in the sidebar and Settings. */
function BackDot({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <Link
      href={href}
      aria-label={t("lesson.backToLibrary")}
      title={t("lesson.backToLibrary")}
      className={`${DOT} pointer-events-auto`}
    >
      <ArrowLeftIcon />
    </Link>
  );
}

function ViewSwitch({
  mode,
  onChange,
}: {
  mode: LessonViewMode;
  onChange: (mode: LessonViewMode) => void;
}) {
  const { t } = useI18n();
  return (
    <SegmentedSwitch
      label={t("lesson.viewMode")}
      options={VIEW_MODES.map((option) => ({ ...option, label: t(option.label) }))}
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
  const { t } = useI18n();
  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <ZoomButton label={t("lesson.zoomOut")} onClick={onOut}>
        <MinusIcon />
      </ZoomButton>
      <span className="w-10 text-center text-caption font-bold text-muted-foreground tabular-nums">
        {percent}%
      </span>
      <ZoomButton label={t("lesson.zoomIn")} onClick={onIn}>
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
