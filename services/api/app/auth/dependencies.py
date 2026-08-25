from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.schemas import AuthenticatedUser
from app.auth.security import InvalidTokenError, decode_access_token
from app.common.errors import ApiError

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None:
        raise ApiError(401, "unauthorized", "Missing bearer token")

    try:
        payload = decode_access_token(credentials.credentials)
        return AuthenticatedUser(id=payload["sub"], email=payload.get("email"))
    except (InvalidTokenError, KeyError, ValueError) as exc:
        raise ApiError(401, "unauthorized", "Invalid or expired token") from exc
