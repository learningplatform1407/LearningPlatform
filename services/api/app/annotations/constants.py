from enum import StrEnum


class AnnotationType(StrEnum):
    HIGHLIGHT = "highlight"
    MARGIN_NOTE = "margin_note"


DEFAULT_HIGHLIGHT_COLOR = "yellow"
