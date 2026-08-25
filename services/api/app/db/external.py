"""Shell tables for schemas owned by Supabase, not by our Alembic migrations.

Registering a minimal Table here lets our own models declare a real
ForeignKey to e.g. `auth.users`, while `include_object` in migrations/env.py
and the `tables=` filter used by tests ensure we never try to create or
migrate these tables ourselves.
"""

from sqlalchemy import Column, Table, Uuid

from app.db.base import Base

auth_users = Table(
    "users",
    Base.metadata,
    Column("id", Uuid(as_uuid=True), primary_key=True),
    schema="auth",
)
