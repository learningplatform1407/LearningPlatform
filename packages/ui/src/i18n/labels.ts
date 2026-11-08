import type { Translator } from "./translate";

const LESSON_STATUSES = ["processing", "ready", "failed"] as const;

/** A lesson's processing status as both apps show it; an unknown status
 * (a newer server) is shown as-is rather than hidden. */
export function lessonStatusLabel(t: Translator["t"], status: string | null | undefined): string {
  if (!status) return "";
  return (LESSON_STATUSES as readonly string[]).includes(status)
    ? t(`learn.status.${status as (typeof LESSON_STATUSES)[number]}`)
    : status;
}

const BADGE_IDS = ["joined", "first-lesson", "first-exam", "three-day-streak"] as const;

/** A profile badge's name and description in the reader's language. The
 * badges are derived client-side with English text (api-client's
 * `computeProfileBadges`); an id the catalogue doesn't know keeps that. */
export function badgeText(
  t: Translator["t"],
  badge: { id: string; label: string; description: string },
): { label: string; description: string } {
  if (!(BADGE_IDS as readonly string[]).includes(badge.id)) return badge;
  const id = badge.id as (typeof BADGE_IDS)[number];
  return {
    label: t(`profile.badges.${id}.label`),
    description: t(`profile.badges.${id}.description`),
  };
}

function pick<K extends string>(keys: readonly K[], value: string | null | undefined): K | null {
  return value && (keys as readonly string[]).includes(value) ? (value as K) : null;
}

/** "correct" / "parțial" -- a graded outcome as a word; unknown stays as-is. */
export function outcomeLabel(t: Translator["t"], outcome: string | null | undefined): string {
  const key = pick(["correct", "partial", "incorrect"] as const, outcome);
  return key ? t(`questions.outcome.${key}`) : (outcome ?? "");
}

/** A quiz session's status as a word; unknown stays as-is. */
export function quizStatusLabel(t: Translator["t"], status: string): string {
  const key = pick(["active", "paused", "completed", "expired", "cancelled"] as const, status);
  return key ? t(`exams.statuses.${key}`) : status;
}

/** A quiz's reveal mode as a word; unknown stays as-is. */
export function revealModeLabel(t: Translator["t"], mode: string): string {
  const key = pick(["immediate", "on_finish"] as const, mode);
  return key ? t(`exams.revealModes.${key}`) : mode;
}
