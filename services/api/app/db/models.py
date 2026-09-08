"""Imports every domain's models so they register on Base.metadata.

Alembic's env.py and the test suite import this module (rather than each
domain's models module individually) before calling anything that relies on
Base.metadata being complete.
"""

from app.annotations.models import DocumentAnnotation
from app.chapters.models import Chapter
from app.db.external import auth_users
from app.documents.models import Document, DocumentVersion, LessonView
from app.plans.models import Subscription
from app.users.models import AccountSettings, Consent, Profile

__all__ = [
    "AccountSettings",
    "Chapter",
    "Consent",
    "Document",
    "DocumentAnnotation",
    "DocumentVersion",
    "LessonView",
    "Profile",
    "Subscription",
    "auth_users",
]
