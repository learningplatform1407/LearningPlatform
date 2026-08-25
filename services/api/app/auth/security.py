from typing import Any

import jwt

from app.core.config import settings


class InvalidTokenError(Exception):
    pass


def decode_access_token(token: str) -> dict[str, Any]:
    if not settings.supabase_jwt_secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is not configured")
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
