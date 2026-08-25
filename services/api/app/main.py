from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.common.errors import ApiError, ErrorResponse, FieldError
from app.core.config import settings
from app.plans.router import router as plans_router
from app.users.router import router as users_router

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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
