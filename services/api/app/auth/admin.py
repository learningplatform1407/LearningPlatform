"""Direct Supabase Auth Admin REST call using the service_role key -- same
reasoning as app/documents/storage.py: this is the one call
supabase-js's `admin.deleteUser()` itself issues, just from the backend.
"""

import uuid

import httpx

from app.core.config import settings


class AuthAdminError(Exception):
    pass


def _headers() -> dict[str, str]:
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }


def delete_auth_user(user_id: uuid.UUID) -> None:
    """Deletes the Supabase Auth user. `profiles.id` is a CASCADE-on-delete
    FK to `auth.users.id` (app/users/models.py's `Profile.id`), so this one
    call also removes the profile and, transitively, everything else the
    user owns -- there is no separate app-side delete path to keep in sync.
    """
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    url = f"{settings.supabase_url}/auth/v1/admin/users/{user_id}"
    response = httpx.delete(url, headers=_headers())
    if response.is_error:
        raise AuthAdminError(f"Failed to delete account: {response.text}")
