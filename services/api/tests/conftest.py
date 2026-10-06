import uuid
from collections.abc import Callable, Generator, Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, Table, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.base import Base
from app.db.models import *  # noqa: F403 -- registers all tables on Base.metadata
from app.db.session import get_db
from app.main import app


def _our_tables() -> list[Table]:
    # Excludes shell tables like `auth.users` (app/db/external.py) that are
    # registered only for ForeignKey resolution — Supabase owns those, we
    # never create or drop them ourselves, in tests or in real migrations.
    return [table for table in Base.metadata.sorted_tables if table.schema != "auth"]


@pytest.fixture
def db_engine() -> Iterator[Engine]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # SQLite ignores foreign key constraints unless explicitly enabled per
    # connection. Postgres (what we actually run on) always enforces them —
    # turning this on locally catches ordering/integrity bugs that would
    # otherwise only surface against the real database.
    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    tables = _our_tables()
    Base.metadata.create_all(engine, tables=tables)
    yield engine
    Base.metadata.drop_all(engine, tables=tables)
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    factory = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    session = factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def authenticated_user() -> AuthenticatedUser:
    return AuthenticatedUser(id=uuid.uuid4(), email="test@example.com")


@pytest.fixture
def authed_client(
    client: TestClient, authenticated_user: AuthenticatedUser
) -> Iterator[TestClient]:
    app.dependency_overrides[get_current_user] = lambda: authenticated_user
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def count_queries(db_engine: Engine) -> Callable[[], Any]:
    """Counts statements issued inside a `with` block.

    Lets a test assert on query *shape* — "this endpoint costs the same
    whether the course has one book or twelve" — which is what actually pins
    down the absence of an N+1. Asserting a magic number instead would just
    churn every time an unrelated query moved.
    """

    @contextmanager
    def _counter() -> Iterator[list[int]]:
        total = [0]

        def before(
            conn: object,
            cursor: object,
            statement: str,
            parameters: object,
            context: object,
            executemany: bool,
        ) -> None:
            total[0] += 1

        event.listen(db_engine, "before_cursor_execute", before)
        try:
            yield total
        finally:
            event.remove(db_engine, "before_cursor_execute", before)

    return _counter
