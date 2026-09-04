"""Direct Supabase Storage REST calls using the service_role key.

storage.buckets/storage.objects are Supabase-managed, so there's no
supabase-py dependency here — these are the same two REST calls the
supabase-js client itself makes under the hood for signed uploads (verified
against the installed @supabase/storage-js source), just issued from the
backend with the service_role key instead of a user's JWT.
"""

from urllib.parse import parse_qs, urlparse

import httpx

from app.core.config import settings
from app.documents.constants import DOCUMENTS_BUCKET


class StorageError(Exception):
    pass


def _headers() -> dict[str, str]:
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }


def create_signed_upload_url(path: str) -> str:
    """Returns the upload token for `path` in the documents bucket."""
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    url = f"{settings.supabase_url}/storage/v1/object/upload/sign/{DOCUMENTS_BUCKET}/{path}"
    response = httpx.post(url, headers=_headers(), json={})
    if response.is_error:
        raise StorageError(f"Failed to create signed upload URL: {response.text}")

    signed_path = response.json().get("url")
    if not isinstance(signed_path, str):
        raise StorageError("No signed URL returned by Storage")

    token = parse_qs(urlparse(signed_path).query).get("token", [None])[0]
    if not isinstance(token, str):
        raise StorageError("No token in signed URL")
    return token


def download_object(path: str) -> bytes:
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    url = f"{settings.supabase_url}/storage/v1/object/{DOCUMENTS_BUCKET}/{path}"
    response = httpx.get(url, headers=_headers())
    if response.is_error:
        raise StorageError(f"Failed to download object: {response.text}")
    return response.content
