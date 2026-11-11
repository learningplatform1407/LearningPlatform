from datetime import timedelta
from enum import StrEnum


class ChallengeStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    COMPLETED = "completed"
    DECLINED = "declined"
    EXPIRED = "expired"


# How long a challenge waits to be accepted. Once accepted it lives as long
# as the session it started.
CHALLENGE_TTL = timedelta(days=7)

MAX_CHALLENGES_LISTED = 50
