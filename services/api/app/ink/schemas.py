from pydantic import BaseModel

from app.notebook.schemas import Stroke


class LessonPageInkResponse(BaseModel):
    strokes: list[Stroke]


class LessonPageInkUpdateRequest(BaseModel):
    strokes: list[Stroke]
