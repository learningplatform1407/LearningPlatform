import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.auth.security import InvalidTokenError, decode_access_token
from app.core.config import settings

TEST_SECRET = "test-secret-at-least-32-bytes-long-for-hs256"


@pytest.fixture(autouse=True)
def _configure_test_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_SECRET)


def _make_token(**overrides: object) -> str:
    payload: dict[str, object] = {
        "sub": str(uuid.uuid4()),
        "email": "test@example.com",
        "aud": "authenticated",
        "exp": datetime.now(UTC) + timedelta(hours=1),
    }
    payload.update(overrides)
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


def test_decode_access_token_valid() -> None:
    token = _make_token()
    payload = decode_access_token(token)
    assert payload["email"] == "test@example.com"


def test_decode_access_token_expired() -> None:
    token = _make_token(exp=datetime.now(UTC) - timedelta(hours=1))
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_decode_access_token_bad_signature() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "aud": "authenticated"},
        "a-different-32-plus-byte-secret-value",
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_decode_access_token_wrong_audience() -> None:
    token = _make_token(aud="something-else")
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)
