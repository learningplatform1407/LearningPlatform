"""Covers the outbound shape of the Storage REST calls.

Everything else stubs `app.documents.storage` wholesale, which is right for
testing callers but leaves the URLs and bodies themselves unasserted -- and a
wrong URL in `delete_object` would be invisible, because its callers log and
swallow failures by design. These tests pin the request shape against what
`@supabase/storage-js` issues.
"""

from collections.abc import Iterator
from unittest.mock import patch

import httpx
import pytest

from app.documents.storage import StorageError, delete_object


@pytest.fixture(autouse=True)
def _configured_storage() -> Iterator[None]:
    """`settings.supabase_url` is None in tests and the helpers raise without
    it, so patch the module's view of settings. `_headers` is stubbed too, so
    no real service-role key is read."""
    with (
        patch("app.documents.storage.settings") as settings,
        patch("app.documents.storage._headers", return_value={"apikey": "test-key"}),
    ):
        settings.supabase_url = "https://project.supabase.test"
        yield


def _ok() -> httpx.Response:
    return httpx.Response(200, json={"message": "Successfully deleted"})


def test_delete_object_uses_the_bulk_prefixes_endpoint() -> None:
    """`DELETE /object/{bucket}` with a `prefixes` body, which is what
    storage-js's `remove()` issues -- not a per-path URL."""
    with patch("app.documents.storage.httpx.request", return_value=_ok()) as request:
        delete_object("feed/3f2a1b0c-0000-4000-8000-000000000000.jpg", bucket="feed-images")

    method, url = request.call_args.args
    assert method == "DELETE"
    assert url == "https://project.supabase.test/storage/v1/object/feed-images"
    assert request.call_args.kwargs["json"] == {
        "prefixes": ["feed/3f2a1b0c-0000-4000-8000-000000000000.jpg"]
    }
    # httpx.delete() accepts no json=, so this has to go through request().
    assert "apikey" in request.call_args.kwargs["headers"]


def test_delete_object_defaults_to_the_documents_bucket() -> None:
    with patch("app.documents.storage.httpx.request", return_value=_ok()) as request:
        delete_object("lecture.pdf")

    _, url = request.call_args.args
    assert url.endswith("/object/documents")


def test_delete_object_raises_on_an_error_response() -> None:
    """Callers swallow this, but it has to be raised for them to swallow it --
    and for the warning to carry the body."""
    with (
        patch(
            "app.documents.storage.httpx.request",
            return_value=httpx.Response(404, json={"error": "not_found"}),
        ),
        pytest.raises(StorageError, match="Failed to delete object"),
    ):
        delete_object("feed/missing.jpg", bucket="feed-images")
