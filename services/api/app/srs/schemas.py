from pydantic import BaseModel

from app.srs.scheduler import NextIntervals


class NextIntervalsResponse(BaseModel):
    """Days each grade would schedule this card for, if chosen now."""

    again: int
    hard: int
    good: int
    easy: int

    @classmethod
    def of(cls, intervals: NextIntervals) -> "NextIntervalsResponse":
        return cls(
            again=intervals.again, hard=intervals.hard, good=intervals.good, easy=intervals.easy
        )
