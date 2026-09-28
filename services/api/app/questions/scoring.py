"""Pluggable scoring schemes. `questions.scoring_scheme` stores a registry
key; this module maps that key to a maximum and a grading function. Adding a
scheme is a new registry entry plus tests — no migration, no schema change.
Do not build a configurable rules engine with conditions in the database;
that is a far larger thing to write, test and debug, and nothing here asks
for it. See docs/architecture/quizzes.md §6.3."""

from collections.abc import Callable
from dataclasses import dataclass

# One source of truth per scheme: the grade function and the registry entry
# below both read these, so a new scheme copy-pasted from an existing one
# cannot silently keep awarding the original's points.
SINGLE_4_MAX_POINTS = 4
MULTI_5_MAX_POINTS = 5


@dataclass(frozen=True)
class ScoringScheme:
    key: str
    max_points: int
    # (selected, correct_key, all_option_ids) -> points awarded
    grade: Callable[[frozenset[str], frozenset[str], frozenset[str]], int]
    # Options a question using this scheme must have exactly, or None for no
    # fixed count. Enforced at import time, never at grading time.
    required_option_count: int | None = None


def _grade_single_4(
    selected: frozenset[str], correct_key: frozenset[str], _all_option_ids: frozenset[str]
) -> int:
    # All or nothing: the one correct option selected scores the max,
    # anything else scores 0. Never partial credit for a single-answer
    # question — per-option marking would pay a student for options they
    # merely didn't pick.
    return SINGLE_4_MAX_POINTS if selected == correct_key else 0


def _grade_multi_5_per_option(
    selected: frozenset[str], correct_key: frozenset[str], all_option_ids: frozenset[str]
) -> int:
    if not selected or selected == all_option_ids or len(selected) == 1:
        # Overrides, regardless of the raw per-option count: nothing
        # selected is unanswered (worth 0), selecting everything trivially
        # captures the whole key (worth 0), and a single selection is too
        # thin an answer to earn avoidance credit (worth 0).
        return 0

    return sum(
        1 for option_id in all_option_ids if (option_id in selected) == (option_id in correct_key)
    )


SCHEMES: dict[str, ScoringScheme] = {
    "single_4": ScoringScheme(
        key="single_4", max_points=SINGLE_4_MAX_POINTS, grade=_grade_single_4
    ),
    "multi_5_per_option": ScoringScheme(
        key="multi_5_per_option",
        max_points=MULTI_5_MAX_POINTS,
        grade=_grade_multi_5_per_option,
        required_option_count=MULTI_5_MAX_POINTS,
    ),
}


def get_scheme(key: str) -> ScoringScheme:
    try:
        return SCHEMES[key]
    except KeyError as exc:
        raise ValueError(f"Unknown scoring scheme: {key!r}") from exc
