from pydantic import BaseModel


class FieldError(BaseModel):
    field: str
    message: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: list[FieldError] | None = None


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[FieldError] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)
