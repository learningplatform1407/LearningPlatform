"""Grading, selection validation, and answer reveal — shared by quiz sessions
and by answering a question directly from the bank.

These three lived as private helpers inside `app/quizzes/service.py` while a
session was the only way to answer anything. The bank answer path needs all
three and lives in the questions domain, which cannot import the quizzes
domain (quizzes already imports questions), so they moved here rather than
being duplicated. The scoring rules themselves still live in `scoring.py`;
this module only applies them.
"""

from app.common.errors import ApiError
from app.questions.constants import Outcome, QuestionKind
from app.questions.models import Question
from app.questions.schemas import OptionResultSchema, QuestionRevealResponse
from app.questions.scoring import get_scheme


def grade_answer(
    scoring_scheme: str,
    selected: list[str],
    correct_option_ids: list[str],
    all_option_ids: list[str],
) -> tuple[int, str]:
    """Points, plus the outcome they imply. `outcome` is derived from the
    points and never stored independently of them (§6.3)."""
    scheme = get_scheme(scoring_scheme)
    points = scheme.grade(
        frozenset(selected), frozenset(correct_option_ids), frozenset(all_option_ids)
    )
    if points >= scheme.max_points:
        outcome = Outcome.CORRECT
    elif points <= 0:
        outcome = Outcome.INCORRECT
    else:
        outcome = Outcome.PARTIAL
    return points, outcome


def validate_selection(
    question: Question, selected_option_ids: list[str], *, require_answer: bool
) -> list[str]:
    """The de-duplicated selection, or `ApiError(400, "invalid_selection")`.

    `require_answer` is what separates the callers: a session under
    `reveal_mode="immediate"` cannot accept an empty selection, because the
    answer is final the moment it is saved, whereas `on_finish` treats empty
    as clearing the answer (§8.5).
    """
    option_ids = {option["id"] for option in question.options}
    selected = list(dict.fromkeys(selected_option_ids))

    if any(option_id not in option_ids for option_id in selected):
        raise ApiError(400, "invalid_selection", "Selected option is not on this question")
    if question.kind == QuestionKind.SINGLE and len(selected) > 1:
        raise ApiError(
            400, "invalid_selection", "A single-kind question accepts only one selected option"
        )
    if not selected and require_answer:
        raise ApiError(400, "invalid_selection", "An answer is required")
    return selected


def build_reveal(
    question: Question,
    *,
    selected_option_ids: list[str] | None,
    points_awarded: int,
    points_possible: int,
    outcome: str,
) -> QuestionRevealResponse:
    """The per-option reveal, carrying **both** scoring axes.

    `in_key` (is this a correct answer) and `classified_correctly` (did you
    earn the point for it) are independent: leaving a wrong option unselected
    earns a point under per-option marking without that option being an
    answer. Collapsing them into one flag would tell a student a wrong option
    was "right" (§6.3).
    """
    selected = set(selected_option_ids or [])
    correct = set(question.correct_option_ids)
    return QuestionRevealResponse(
        prompt=question.prompt,
        kind=question.kind,
        points_awarded=points_awarded,
        points_possible=points_possible,
        outcome=outcome,
        explanation=question.explanation,
        options=[
            OptionResultSchema(
                id=option["id"],
                text=option["text"],
                in_key=option["id"] in correct,
                selected=option["id"] in selected,
                classified_correctly=(option["id"] in selected) == (option["id"] in correct),
                rationale=question.rationales.get(option["id"]),
            )
            for option in question.options
        ],
    )
