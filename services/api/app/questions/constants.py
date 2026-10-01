from enum import StrEnum


class QuestionKind(StrEnum):
    SINGLE = "single"
    MULTI = "multi"


class QuestionStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Outcome(StrEnum):
    """How an answer scored. Lives here rather than in `app/quizzes` because
    grading is now shared: both a quiz session and a direct answer from the
    question bank produce one, and the questions domain cannot import the
    quizzes domain (quizzes already imports this one)."""

    CORRECT = "correct"
    PARTIAL = "partial"
    INCORRECT = "incorrect"


MAX_IMPORT_QUESTIONS = 500

# Upper bound on tags in one filter. Tags AND together as one correlated
# EXISTS each, so this keeps the number of predicates bounded.
MAX_FILTER_TAGS = 20
