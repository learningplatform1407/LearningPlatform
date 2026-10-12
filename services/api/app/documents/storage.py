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


def create_signed_upload_url(path: str, bucket: str = DOCUMENTS_BUCKET) -> str:
    """Returns the upload token for `path` in `bucket`.

    `bucket` is a trailing keyword-defaulted parameter so existing document
    call sites are unchanged. The feed passes FEED_IMAGES_BUCKET -- which has
    no INSERT policy at all, exactly like documents, so a token minted here
    behind require_admin is the only way to write to it.
    """
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    url = f"{settings.supabase_url}/storage/v1/object/upload/sign/{bucket}/{path}"
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


def upload_object(path: str, data: bytes, content_type: str) -> None:
    """Backend-initiated upload (e.g. an image extracted during processing) —
    uses the service_role key directly rather than a signed URL, since this
    isn't a client-initiated write that needs separate admin-gating.

    No `bucket` parameter, unlike its two neighbours: nothing writes to a
    second bucket from the backend, and the feed uploads through a signed URL
    instead. Add one when there is a caller."""
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    url = f"{settings.supabase_url}/storage/v1/object/{DOCUMENTS_BUCKET}/{path}"
    headers = {**_headers(), "Content-Type": content_type, "x-upsert": "true"}
    response = httpx.post(url, headers=headers, content=data)
    if response.is_error:
        raise StorageError(f"Failed to upload object: {response.text}")


def delete_object(path: str, bucket: str = DOCUMENTS_BUCKET) -> None:
    """Removes one object. Callers treat failure as non-fatal: an orphaned
    object is benign, whereas failing a request the database already committed
    would leave the user staring at an error for work that succeeded.

    Uses the bulk endpoint -- `DELETE /object/{bucket}` with a `prefixes`
    body -- because that is the one `@supabase/storage-js`'s `remove()`
    actually issues, checked against the installed source the same way the
    signed-upload calls above were. An earlier version guessed at a per-path
    `DELETE /object/{bucket}/{path}`, which is a bad thing to guess in a
    function whose callers swallow its failures: were that URL wrong, nothing
    would ever be deleted and only a log line would say so.

    Note `httpx.delete()` accepts no `json=`, hence the explicit `request`.
    """
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    url = f"{settings.supabase_url}/storage/v1/object/{bucket}"
    response = httpx.request("DELETE", url, headers=_headers(), json={"prefixes": [path]})
    if response.is_error:
        raise StorageError(f"Failed to delete object: {response.text}")
