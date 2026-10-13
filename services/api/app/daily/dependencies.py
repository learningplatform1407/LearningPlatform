"""One frozen reading of the clock per request.

Resolved once and passed down rather than read wherever it is needed, for two
reasons. It is the seam the tests use -- `app.dependency_overrides[get_clock]`
pins a date exactly as conftest already overrides `get_db` and
`get_current_user`, which is what lets "which day is it" be asserted without
freezegun. And a single frozen value means `now` and `today` cannot disagree
with each other: computing them separately inside one request would, once a
year on a midnight boundary, yield an instant from one day and a date from
the next.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime

from app.core.clock import institution_today


@dataclass(frozen=True)
class Clock:
    now: datetime
    today: date


def get_clock() -> Clock:
    now = datetime.now(UTC)
    return Clock(now=now, today=institution_today(now))
