"""CLI entrypoint for the quiz-session sweeper — QUIZ-7b. Ship this as a
scheduled container job: `python -m app.quizzes.sweep`. Deliberately not an
HTTP endpoint: a scheduler has no Supabase session and bearer tokens expire
hourly, so `require_admin` cannot gate it, and correctness never actually
depends on this running anyway (`_refresh_session_state` does lazy expiry on
every touch). This is a second line of defence for sessions nobody ever
touches again. See docs/architecture/quizzes.md §10."""

import logging

from app.core.logging import configure_logging
from app.db.session import get_session_factory
from app.quizzes.service import sweep_expired

logger = logging.getLogger(__name__)


def main() -> None:
    configure_logging()
    db = get_session_factory()()
    try:
        swept = sweep_expired(db)
        logger.info("Swept %d expired quiz session(s)", swept)
    finally:
        db.close()


if __name__ == "__main__":
    main()
