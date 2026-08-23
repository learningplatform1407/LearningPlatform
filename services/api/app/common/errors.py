from pydantic import BaseModel


class FieldError(BaseModel):
    field: str
    message: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: list[FieldError] | None = None
