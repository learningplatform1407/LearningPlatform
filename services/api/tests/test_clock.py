"""The institution day boundary, including both DST transitions.

Every other temporal test in this suite controls time by offsetting from the
real clock, which cannot express "which calendar day is this instant in". This
one can, because `institution_today` takes the instant as an argument -- which
is the whole reason it is shaped that way.

The boundary instants below were computed against the real tz database rather
than reasoned out: Europe/Bucharest shifted +02:00 -> +03:00 on 2026-03-29 and
back on 2026-10-25.
"""

from datetime import UTC, date, datetime

import pytest

from app.core.clock import institution_today, institution_zone


def _utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=UTC)


def test_the_zone_is_configured_not_the_host_default() -> None:
    assert str(institution_zone()) == "Europe/Bucharest"


def test_the_day_rolls_at_local_midnight_not_utc() -> None:
    """The point of the whole exercise: 21:30 UTC is already tomorrow here.

    A UTC-keyed implementation would hand a late-evening learner yesterday's
    question.
    """
    assert institution_today(_utc("2026-10-12T20:30")) == date(2026, 10, 12)
    assert institution_today(_utc("2026-10-12T21:30")) == date(2026, 10, 13)


@pytest.mark.parametrize(
    ("instant", "expected"),
    [
        # Spring forward: 2026-03-29 is 23 hours long, starting at 22:00Z the
        # day before (+02:00) and ending at 21:00Z (+03:00).
        ("2026-03-28T21:30", date(2026, 3, 28)),
        ("2026-03-28T22:30", date(2026, 3, 29)),
        ("2026-03-29T20:30", date(2026, 3, 29)),
        ("2026-03-29T21:30", date(2026, 3, 30)),
        # Autumn back: 2026-10-25 is 25 hours long, starting at 21:00Z the day
        # before (+03:00) and ending at 22:00Z (+02:00).
        ("2026-10-24T20:30", date(2026, 10, 24)),
        ("2026-10-24T21:30", date(2026, 10, 25)),
        ("2026-10-25T21:30", date(2026, 10, 25)),
        ("2026-10-25T22:30", date(2026, 10, 26)),
    ],
)
def test_dst_transitions_yield_exactly_one_date_each(instant: str, expected: date) -> None:
    assert institution_today(_utc(instant)) == expected


def test_a_naive_instant_is_rejected_rather_than_assumed() -> None:
    """Without the guard, `astimezone` assumes the *host's* zone -- silently
    giving a server in one region a different "today" from one in another,
    which is the single thing this module exists to prevent."""
    with pytest.raises(ValueError, match="aware datetime"):
        institution_today(datetime(2026, 10, 12, 21, 30))
