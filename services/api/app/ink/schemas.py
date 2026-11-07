from typing import Annotated

from pydantic import BaseModel, Field

from app.notebook.schemas import Stroke

# A coordinate as a fraction of the page's width or height.
Unit = Annotated[float, Field(ge=0, le=1)]


class PageHighlight(BaseModel):
    """One highlight on a PDF page: a colour name and the rectangles it covers
    (one per run of words on a line), each `[x0, y0, x1, y1]` in page units."""

    color: str = Field(max_length=16)
    rects: list[tuple[Unit, Unit, Unit, Unit]] = Field(min_length=1, max_length=200)


class LessonPageInkResponse(BaseModel):
    strokes: list[Stroke]
    highlights: list[PageHighlight]


class LessonPageInkUpdateRequest(BaseModel):
    strokes: list[Stroke]
    # Optional so a client that only draws (today's mobile app) can keep
    # saving its strokes without wiping highlights made on the web: `None`
    # leaves them as they are; a list (even empty) replaces them.
    highlights: list[PageHighlight] | None = Field(default=None, max_length=500)


class PageWord(BaseModel):
    """One word on a PDF page and its box, `[x0, y0, x1, y1]` in page units.
    `line` groups the words of one printed line, so a client can join a run
    of them into a single highlight rectangle."""

    text: str
    box: tuple[float, float, float, float]
    line: int


class PageWordsResponse(BaseModel):
    words: list[PageWord]
