from enum import StrEnum


class FlashcardScope(StrEnum):
    """Where a card came from, and therefore who can see it.

    Written by the endpoint that created the card and never recomputed:
    POST /v1/flashcards/import (admin-gated) always writes OFFICIAL, and
    POST /v1/documents/{id}/flashcards (any learner) always writes PERSONAL.
    Neither reads it from the request body.

    Deliberately *not* derived from the author's role at read time. A role is
    an authorization check at write time ("may you call this endpoint?"), not
    a classification. Deriving it would mean an admin's own study card counted
    as official, revoking an admin's role silently reclassified every card
    they had uploaded, and promoting a learner exposed their private cards.
    `created_by` records who made a card; this records who it is for.
    """

    OFFICIAL = "official"
    PERSONAL = "personal"


class FlashcardStatus(StrEnum):
    """Mirrors QuestionStatus so an official deck can be staged before
    release and retired without being destroyed. Personal cards are created
    PUBLISHED and hard-deleted rather than archived -- they are the learner's
    own data, not shared content worth keeping a tombstone for."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ScopeFilter(StrEnum):
    """The `scope` query param behind the All / Official / Mine toggle. ALL is
    the default: official and personal cards share one due queue, so the
    toggle narrows the view without splitting the schedule."""

    ALL = "all"
    OFFICIAL = "official"
    PERSONAL = "personal"


MAX_IMPORT_FLASHCARDS = 500

# Deck size the runner asks for when it doesn't say. Bounded because the draw
# materialises the whole deck (front and back) in one response.
DEFAULT_DECK_SIZE = 20
MAX_DECK_SIZE = 100
