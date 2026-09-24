import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.annotations.router import router as annotations_router
from app.books.router import router as books_router
from app.chapters.router import router as chapters_router
from app.common.errors import ApiError, ErrorResponse, FieldError
from app.core.config import settings
from app.core.logging import configure_logging
from app.db import models as _db_models  # noqa: F401 -- registers all tables on Base.metadata
from app.documents.router import router as documents_router
from app.notebook.router import router as notebook_router
from app.plans.router import router as plans_router
from app.questions.router import router as questions_router
from app.questions.router import tags_router
from app.sub_chapters.router import router as sub_chapters_router
from app.users.router import router as users_router

configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="LearningPlatform API", version="0.0.1")

if settings.cors_allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.cors_allowed_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(users_router)
app.include_router(plans_router)
app.include_router(books_router)
app.include_router(chapters_router)
app.include_router(sub_chapters_router)
app.include_router(documents_router)
app.include_router(annotations_router)
app.include_router(notebook_router)
app.include_router(questions_router)
app.include_router(tags_router)


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    body = ErrorResponse(code=exc.code, message=exc.message, details=exc.details)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    body = ErrorResponse(code="http_error", message=str(exc.detail))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = [
        FieldError(field=".".join(str(part) for part in error["loc"]), message=error["msg"])
        for error in exc.errors()
    ]
    body = ErrorResponse(
        code="validation_error", message="Request validation failed", details=details
    )
    return JSONResponse(status_code=422, content=body.model_dump())


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Registering this for the base Exception class makes Starlette's
    # ExceptionMiddleware handle every otherwise-uncaught error here instead
    # of falling through to ServerErrorMiddleware's default behavior, which
    # logs a full traceback and re-raises to uvicorn for a second, duplicate
    # log of the same exception. One line here replaces both.
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    body = ErrorResponse(code="internal_error", message="Internal server error")
    return JSONResponse(status_code=500, content=body.model_dump())


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
