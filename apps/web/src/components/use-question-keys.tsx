"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "@/lib/i18n";

/**
 * Number keys answer the question you are looking at (web only).
 *
 * `1` picks A, `2` picks B, and so on; `Enter` checks. Which question they
 * reach is decided in this order:
 *
 * 1. the question holding keyboard focus, if any -- so tabbing through a
 *    list and typing works, and a reader who has clicked into one question
 *    keeps the keys there even after scrolling;
 * 2. otherwise the top-most question on screen -- so scroll-and-type works
 *    without having to click anything first.
 *
 * One listener for the whole app (mounted in the app shell) rather than one
 * per question: the rule above is about the document as a whole, and a
 * listener per card would have every card answering the same keypress.
 */

/** Marks the element a question's keys belong to, holding its question id. */
export const QUESTION_CARD_ATTR = "data-question-card";

export interface QuestionKeyHandlers {
  /** How many options there are: `5` does nothing on a four-option question. */
  optionCount: number;
  /** Picks the option at this 0-based index. */
  choose: (index: number) => void;
  /** Enter. Omitted when there is nothing to check (an answered question). */
  submit?: () => void;
}

type Registry = Map<string, { current: QuestionKeyHandlers }>;

const QuestionKeysContext = createContext<Registry | null>(null);

/** Input types that take no text, so having one focused is not typing.
 * Every option is a label over an `sr-only` radio or checkbox, and clicking
 * one focuses it -- treating that as typing killed the keys for the rest of
 * the session the moment anybody picked an answer with the mouse. */
const NON_TEXT_INPUT = /^(radio|checkbox|button|submit|reset|range|color|file|image)$/;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT.test(target.type);
  return /^(TEXTAREA|SELECT)$/.test(target.tagName);
}

/** True for an element the browser already activates on Enter, so Enter is
 * left to it rather than also checking the answer. */
function handlesEnterItself(element: Element | null): boolean {
  return element instanceof HTMLElement && /^(BUTTON|A|SUMMARY)$/.test(element.tagName);
}

function onScreen(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

/** The question the keys apply to: the focused one, else the top-most one on
 * screen. Candidates inside an open dialog win outright -- with the question
 * of the day over the page, the question behind the scrim is not the one the
 * reader is answering.
 *
 * Focus only wins **while that question is still on screen**. Picking an
 * option leaves the focus on its (`sr-only`) radio, and nothing takes it
 * away again, so without this the keys followed a question the reader had
 * long since scrolled past -- answering one they could not see. */
function armedCardId(registry: Registry): string | null {
  const focusedCard = document.activeElement?.closest<HTMLElement>(`[${QUESTION_CARD_ATTR}]`);
  const focused = focusedCard?.getAttribute(QUESTION_CARD_ATTR) ?? null;
  if (focused !== null && registry.has(focused) && onScreen(focusedCard!)) return focused;

  const cards = [...document.querySelectorAll<HTMLElement>(`[${QUESTION_CARD_ATTR}]`)];
  const inDialog = cards.filter((card) => card.closest('[role="dialog"]') !== null);
  for (const card of inDialog.length > 0 ? inDialog : cards) {
    const id = card.getAttribute(QUESTION_CARD_ATTR);
    if (id === null || !registry.has(id)) continue;
    if (onScreen(card)) return id;
  }
  return null;
}

export function QuestionKeysProvider({ children }: { children: ReactNode }) {
  // One registry for the life of the provider; cards add and remove
  // themselves as they mount.
  const [registry] = useState<Registry>(() => new Map());

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const digit = /^[1-9]$/.test(event.key) ? Number(event.key) : null;
      const enter = event.key === "Enter";
      if (digit === null && !enter) return;
      if (enter && handlesEnterItself(document.activeElement)) return;

      const id = armedCardId(registry);
      const handlers = id === null ? undefined : registry.get(id)?.current;
      if (!handlers) return;

      if (digit !== null) {
        if (digit > handlers.optionCount) return;
        handlers.choose(digit - 1);
      } else {
        if (!handlers.submit) return;
        handlers.submit();
      }
      event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [registry]);

  return <QuestionKeysContext.Provider value={registry}>{children}</QuestionKeysContext.Provider>;
}

/**
 * Arms one question for the number keys, for as long as it is mounted.
 *
 * Handlers are read through a ref, so a card re-rendering on every keystroke
 * (which it does -- picking an option is state) neither re-registers nor
 * re-binds the listener.
 */
export function useQuestionKeys(questionId: string, handlers: QuestionKeyHandlers): void {
  const registry = useContext(QuestionKeysContext);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!registry) return;
    registry.set(questionId, latest);
    return () => {
      // Only if it is still ours: two cards for the same question (the bank
      // and a lesson's Quizzes tab list the same questions) would otherwise
      // have the first to unmount delete the second's entry.
      if (registry.get(questionId) === latest) registry.delete(questionId);
    };
  }, [registry, questionId]);
}

/** The shortcuts, said once per question beside its Check button. Hidden
 * where there is no keyboard to press them with -- a coarse pointer with no
 * hover is a phone or a tablet. */
export function QuestionKeysHint({ optionCount }: { optionCount: number }) {
  const { t } = useI18n();
  if (optionCount === 0) return null;
  return (
    <span className="hidden text-caption font-semibold text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:inline">
      {t("questions.chooseKeys", { last: Math.min(optionCount, 9) })}
    </span>
  );
}
