import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePrivateKey

from app.auth import security
from app.auth.security import InvalidTokenError, decode_access_token
from app.core.config import settings

_TEST_PRIVATE_KEY: EllipticCurvePrivateKey = ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(autouse=True)
def _configure_test_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    """Points decode_access_token at a fake, network-free JWKS client.

    Real Supabase projects verify tokens via a hosted JWKS endpoint over
    HTTPS; here we swap that lookup for a fixed local key pair so the real
    signature/expiry/audience verification logic in jwt.decode still runs,
    without any network access.
    """
    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")
    signing_key = SimpleNamespace(key=_TEST_PRIVATE_KEY.public_key())
    fake_jwks_client = SimpleNamespace(get_signing_key_from_jwt=lambda token: signing_key)
    monkeypatch.setattr(security, "_get_jwks_client", lambda: fake_jwks_client)


def _make_token(**overrides: Any) -> str:
    payload: dict[str, object] = {
        "sub": str(uuid.uuid4()),
        "email": "test@example.com",
        "aud": "authenticated",
        "exp": datetime.now(UTC) + timedelta(hours=1),
    }
    payload.update(overrides)
    return jwt.encode(payload, _TEST_PRIVATE_KEY, algorithm="ES256")


def test_decode_access_token_valid() -> None:
    token = _make_token()
    payload = decode_access_token(token)
    assert payload["email"] == "test@example.com"


def test_decode_access_token_expired() -> None:
    token = _make_token(exp=datetime.now(UTC) - timedelta(hours=1))
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_decode_access_token_bad_signature() -> None:
    wrong_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "aud": "authenticated"}, wrong_key, algorithm="ES256"
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_decode_access_token_wrong_audience() -> None:
    token = _make_token(aud="something-else")
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)
