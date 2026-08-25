from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient

from app.core.config import settings


class InvalidTokenError(Exception):
    pass


@lru_cache
def _get_jwks_client() -> PyJWKClient:
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")
    return PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")


def decode_access_token(token: str) -> dict[str, Any]:
    jwks_client = _get_jwks_client()
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except Exception as exc:
        # Covers bad/expired signatures, wrong audience, an unreachable JWKS
        # endpoint, and no matching key id — all mean "can't trust this token".
        raise InvalidTokenError(str(exc)) from exc
