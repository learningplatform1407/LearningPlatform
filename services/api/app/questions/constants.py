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


MAX_IMPORT_QUESTIONS = 500
