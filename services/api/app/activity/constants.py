from enum import StrEnum


class ActivityKind(StrEnum):
    EXAM_COMPLETED = "exam_completed"
    LESSON_COMPLETED = "lesson_completed"
    STREAK_MILESTONE = "streak_milestone"


# Streak lengths worth telling your followers about. Past the last one,
# every further hundred days.
STREAK_MILESTONES = (3, 7, 14, 30, 50, 100)

DEFAULT_ACTIVITY_LIMIT = 20
MAX_ACTIVITY_LIMIT = 50
