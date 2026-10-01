from enum import StrEnum


class SessionStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


# Statuses that count toward the one-open-session-per-user partial index.
OPEN_STATUSES = frozenset({SessionStatus.ACTIVE, SessionStatus.PAUSED})
TERMINAL_STATUSES = frozenset(
    {SessionStatus.COMPLETED, SessionStatus.EXPIRED, SessionStatus.CANCELLED}
)


class RevealMode(StrEnum):
    IMMEDIATE = "immediate"
    ON_FINISH = "on_finish"


MIN_QUESTION_COUNT = 1
MAX_QUESTION_COUNT = 100
MIN_DURATION_SECONDS = 60
MAX_DURATION_SECONDS = 14400

# History listing size (§7.2).
HISTORY_LIMIT = 20

# Sessions inactive this long are swept regardless of a materialised
# deadline — the guard against an untimed (or abandoned-while-paused)
# session wedging the one-open-session index forever (§6.2, §10).
STALE_AFTER_SECONDS = 6 * 60 * 60
