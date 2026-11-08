"use client";

import type { ReactNode } from "react";

import { HIGHLIGHT_COLOR_NAMES, pageColors } from "@lp/ui";

import { BulbIcon, EraserIcon, NoteIcon, PenIcon, UndoIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";

import {
  toolAvailable,
  type LessonTool,
  type LessonViewMode,
  type SwatchIndex,
  type TextScale,
} from "./lesson-tools";

/**
 * The lesson's tools, in a notch glued to the left edge (design.md §5).
 * Slides right to sit beside the table of contents when that opens.
 *
 * Unavailable tools stay visible but dimmed, and say why when tapped --
 * `aria-disabled` rather than `disabled`, so the explanation is reachable.
 */
export function ToolNotch({
  tool,
  viewMode,
  onLessonTab,
  canUndo,
  tocOpen,
  onToggleToc,
  onSwatch,
  onTool,
  onUndo,
  textScale,
  onTextScale,
}: {
  tool: LessonTool;
  viewMode: LessonViewMode;
  onLessonTab: boolean;
  canUndo: boolean;
  tocOpen: boolean;
  onToggleToc: () => void;
  onSwatch: (color: SwatchIndex) => void;
  onTool: (kind: "pen" | "eraser" | "note") => void;
  onUndo: () => void;
  textScale: TextScale;
  onTextScale: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  function guard(available: boolean, reason: string, action: () => void) {
    return () => {
      if (!onLessonTab) toast(t("lesson.tools.onlyInLesson"));
      else if (!available) toast(reason);
      else action();
    };
  }

  const penMode = tool?.kind === "pen";

  return (
    // The landmark lets screen-reader users jump straight to the tools.
    <aside aria-label={t("lesson.tools.toolbar")} data-no-swipe>
      <div
        role="toolbar"
        aria-label={t("lesson.tools.label")}
        aria-orientation="vertical"
        style={{ left: tocOpen ? 280 : 0 }}
        className="fixed top-1/2 z-[60] flex w-[42px] -translate-y-1/2 flex-col items-center gap-[3px] rounded-r-xl border border-l-0 border-border bg-background px-[5px] py-1.5 shadow-edge-left transition-[left] duration-[250ms] ease-in-out"
      >
        <ToolButton
          label={tocOpen ? t("lesson.tools.hideContents") : t("lesson.tools.showContents")}
          pressed={tocOpen}
          onClick={onToggleToc}
        >
          <span className="text-[22px] leading-none font-semibold">{tocOpen ? "‹" : "›"}</span>
        </ToolButton>

        {HIGHLIGHT_COLOR_NAMES.map((name, index) => {
          const swatch = index as SwatchIndex;
          const active =
            (tool?.kind === "highlight" || tool?.kind === "pen") && tool.color === swatch;
          return (
            <ToolButton
              key={name}
              label={t(penMode ? "lesson.tools.penColour" : "lesson.tools.highlight", {
                color: t(`colors.${name}`),
              })}
              title={t(penMode ? "lesson.tools.penColourTitle" : "lesson.tools.markerTitle", {
                color: t(`colors.${name}`),
                key: index + 1,
              })}
              pressed={active}
              dimmed={!onLessonTab}
              onClick={guard(true, "", () => onSwatch(swatch))}
            >
              <span
                className="block h-5 w-[13px] rounded-[4px]"
                style={{ background: pageColors.swatches[index] }}
              />
            </ToolButton>
          );
        })}

        <span aria-hidden="true" className="my-[3px] h-px w-[22px] bg-border" />

        <ToolButton
          label={t("lesson.tools.explain")}
          title={t("lesson.tools.explainTitle")}
          dimmed
          onClick={() => toast(t("lesson.tools.explainSoon"))}
        >
          <BulbIcon />
        </ToolButton>
        <ToolButton
          label={t("lesson.tools.note")}
          title={viewMode === "text" ? t("lesson.tools.noteTitle") : t("lesson.tools.noteTextOnly")}
          pressed={tool?.kind === "note"}
          dimmed={!onLessonTab || !toolAvailable("note", viewMode)}
          onClick={guard(toolAvailable("note", viewMode), t("lesson.tools.noteTextOnlyToast"), () =>
            onTool("note"),
          )}
        >
          <NoteIcon />
        </ToolButton>
        <ToolButton
          label={t("lesson.tools.pen")}
          title={viewMode === "pdf" ? t("lesson.tools.penTitle") : t("lesson.tools.penPdfOnly")}
          pressed={penMode}
          dimmed={!onLessonTab || !toolAvailable("pen", viewMode)}
          onClick={guard(toolAvailable("pen", viewMode), t("lesson.tools.penPdfOnlyToast"), () =>
            onTool("pen"),
          )}
        >
          <PenIcon />
        </ToolButton>
        <ToolButton
          label={t("lesson.tools.eraser")}
          title={t("lesson.tools.eraserTitle")}
          pressed={tool?.kind === "eraser"}
          dimmed={!onLessonTab}
          onClick={guard(true, "", () => onTool("eraser"))}
        >
          <EraserIcon />
        </ToolButton>
        <ToolButton
          label={t("lesson.tools.undo")}
          title={t("lesson.tools.undoTitle")}
          dimmed={!onLessonTab || !canUndo}
          onClick={guard(canUndo, t("lesson.nothingToUndo"), onUndo)}
        >
          <UndoIcon />
        </ToolButton>

        <span aria-hidden="true" className="my-[3px] h-px w-[22px] bg-border" />

        {/* Text size works on every tab: it sizes the Review text too. */}
        <ToolButton
          label={t("lesson.tools.textSize")}
          title={t("lesson.tools.textSizeValue", { percent: textScale })}
          onClick={onTextScale}
        >
          <span className="text-[13px] leading-none font-extrabold">Aa</span>
        </ToolButton>
      </div>
    </aside>
  );
}

function ToolButton({
  label,
  title,
  pressed,
  dimmed = false,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  pressed?: boolean;
  dimmed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      aria-disabled={dimmed || undefined}
      onClick={onClick}
      className="flex h-[31px] w-[31px] items-center justify-center rounded-sm border-[1.5px] border-transparent p-0 text-foreground transition-colors hover:bg-muted aria-disabled:opacity-30 aria-pressed:border-current aria-pressed:bg-muted"
    >
      {children}
    </button>
  );
}
