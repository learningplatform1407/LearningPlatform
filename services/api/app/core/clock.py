"""Which calendar day it is, according to the institution.

The rest of the backend reasons only about instants -- every temporal column
is DateTime(timezone=True) and every clock read is `datetime.now(UTC)`. The
question of the day is the first feature that needs a *date*, and a date only
exists relative to a timezone, so this is where that conversion lives and the
only place that reads `settings.institution_timezone`.

`institution_today` takes the instant rather than reading a clock, which is
what makes the one timezone-sensitive line in the system testable with a
literal -- the same reasoning as `compute_next_state(..., now=now)` in
app/srs/scheduler.py.
"""

from datetime import date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import settings


@lru_cache(maxsize=1)
def institution_zone() -> ZoneInfo:
    """The configured zone.

    Cached because ZoneInfo reads the system tz database on construction and
    this is consulted on every daily-question request. `tzdata` is a declared
    dependency so this cannot fail on a slim image -- without it ZoneInfo
    raises ZoneInfoNotFoundError at request time rather than startup, which
    would surface as a 500 on the Learn page.
    """
    return ZoneInfo(settings.institution_timezone)


def institution_today(now: datetime) -> date:
    """The institution-local calendar date containing `now`.

    Always instant -> astimezone -> date. Never construct a local midnight and
    offset from it: on the spring-forward day local 03:00-04:00 does not
    exist, so that arithmetic silently lands on the wrong day twice a year.

    Rejects a naive datetime rather than converting it. `astimezone` would
    happily assume the *host's* zone, which is precisely the thing this module
    exists to stop -- and it would do so silently, giving a server in one
    region a different notion of "today" from one in another.
    """
    if now.tzinfo is None:
        raise ValueError("institution_today requires an aware datetime, got a naive one")
    return now.astimezone(institution_zone()).date()
