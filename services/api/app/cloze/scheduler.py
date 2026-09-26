"""Pure SM-2 scheduling math -- the same algorithm Anki has used since 1987,
simplified to whole-day intervals (no Anki-style sub-day "learning steps").
Kept dependency- and side-effect-free so each rating branch is directly
unit-testable against hand-computed examples; app/cloze/service.py is what
reads/writes ClozeReviewState around a call to compute_next_state.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

ClozeRating = Literal["again", "hard", "good", "easy"]

# SM-2's ease floor -- a card can get progressively harder to schedule
# further apart, but never below a 130% multiplier, matching Anki.
_MIN_EASE = 1.3
_EASY_BONUS = 1.3
_HARD_FACTOR = 1.2


@dataclass(frozen=True)
class SchedulerState:
    ease_factor: float
    interval_days: int
    repetitions: int


@dataclass(frozen=True)
class SchedulerResult:
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime


def compute_next_state(
    rating: ClozeRating, state: SchedulerState, now: datetime | None = None
) -> SchedulerResult:
    now = now or datetime.now(UTC)
    ease, interval, repetitions = state.ease_factor, state.interval_days, state.repetitions

    if rating == "again":
        ease = max(_MIN_EASE, ease - 0.20)
        interval = 1
        repetitions = 0
    elif rating == "hard":
        ease = max(_MIN_EASE, ease - 0.15)
        interval = max(1, round(interval * _HARD_FACTOR)) if interval > 0 else 1
        repetitions += 1
    else:  # good | easy -- share the same interval-growth step
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease)
        if rating == "easy":
            interval = round(interval * _EASY_BONUS)
            ease = ease + 0.15
        repetitions += 1

    return SchedulerResult(
        ease_factor=ease,
        interval_days=interval,
        repetitions=repetitions,
        due_at=now + timedelta(days=interval),
    )
