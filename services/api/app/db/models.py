"""Imports every domain's models so they register on Base.metadata.

Alembic's env.py and the test suite import this module (rather than each
domain's models module individually) before calling anything that relies on
Base.metadata being complete.
"""

from app.annotations.models import DocumentAnnotation
from app.books.models import Book
from app.chapters.models import Chapter
from app.cloze.models import ClozeCard, ClozeReviewState
from app.db.external import auth_users
from app.documents.models import (
    Document,
    DocumentVersion,
    Flashcard,
    LessonView,
    Quiz,
)
from app.notebook.models import NotebookEntry
from app.plans.models import Subscription
from app.progress.models import QuestionProgress
from app.questions.models import Question, QuestionTag, Tag
from app.quizzes.models import QuizSession, QuizSessionQuestion
from app.sub_chapters.models import SubChapter
from app.users.models import AccountSettings, Consent, Profile

__all__ = [
    "AccountSettings",
    "Book",
    "Chapter",
    "ClozeCard",
    "ClozeReviewState",
    "Consent",
    "Document",
    "DocumentAnnotation",
    "DocumentVersion",
    "Flashcard",
    "LessonView",
    "NotebookEntry",
    "Profile",
    "Question",
    "QuestionProgress",
    "QuestionTag",
    "Quiz",
    "QuizSession",
    "QuizSessionQuestion",
    "SubChapter",
    "Subscription",
    "Tag",
    "auth_users",
]
