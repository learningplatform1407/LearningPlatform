from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.questions.schemas import OptionSchema, QuestionRevealResponse


class DailyQuestionPrompt(BaseModel):
    """The question as someone who has not answered it may see it.

    Omits `correct_option_ids`, `rationales` and `explanation` by
    construction, for the reason `QuestionBankItem`'s docstring gives: the
    omission *is* the safety story, because then no response model exists that
    could leak the key early. `options` is safe verbatim -- it holds only
    `{id, text}`.

    Not `QuestionBankItem` itself, despite sharing that rule: that model also
    carries `tags` and `progress`, which are bank-browsing concerns. A daily
    question has no tag filter and deliberately records no `question_progress`,
    so reusing it would mean populating two fields that have nothing to say.
    """

    id: UUID
    prompt: str
    kind: Literal["single", "multi"]
    difficulty: Literal["easy", "medium", "hard"]
    points_possible: int
    options: list[OptionSchema]


class DailyQuestionResponse(BaseModel):
    """One day of the calendar, as the caller is entitled to see it.

    `attempt` is non-null **iff** this caller answered this day, and it is the
    only field that ever carries the answer key. "Show the score and the
    reasoning if they solved it, otherwise just the question" is therefore one
    nullable field rather than a branch each client could get wrong.

    That also protects the exam pool: questions are shared with it, so
    revealing the key for a day someone never answered would burn that
    question for them in a future quiz.
    """

    for_date: date
    # The client never computes "today" from its own clock -- a device in
    # another timezone, or simply set wrong, would disagree with the
    # institution day about which question is current. Same rule as
    # QuizSession.server_time; see docs/architecture/quizzes.md.
    server_today: date
    # True only for today, when this caller has not answered and the question
    # is still published. Computed here rather than derived client-side, for
    # the reason ad08d02 established for flashcards' can_edit.
    answerable: bool
    # None only when the bank holds no published question at all, which is a
    # quiet empty state rather than an error -- a fresh environment must not
    # greet everyone with a failure on the Learn page.
    question: DailyQuestionPrompt | None
    attempt: QuestionRevealResponse | None


class DailyQuestionDay(BaseModel):
    """One cell of the calendar. Deliberately thin: the grid needs to know
    that a day exists and how it went, not what it asked."""

    for_date: date
    answered: bool
    outcome: Literal["correct", "partial", "incorrect"] | None


class DailyQuestionCalendarResponse(BaseModel):
    server_today: date
    days: list[DailyQuestionDay]


class DailyAnswerRequest(BaseModel):
    """No date: the day being answered is always the server's today.

    `question_id` is a concurrency token rather than a lookup key. A client
    that rendered at 23:59:58 and submits at 00:00:01 is answering yesterday's
    question in good faith, and must get a recoverable 409 telling it to
    refetch -- not have that answer silently recorded against a new day's
    question. Carrying the date in the path would instead have made it a
    rejected request for an answer the user gave in time.
    """

    question_id: UUID
    selected_option_ids: list[str] = Field(default_factory=list)


class DailyQuestionOverrideRequest(BaseModel):
    """`None` means "draw a different one at random", which covers the common
    case of a broken or duplicated question better than hunting down a
    replacement id does."""

    question_id: UUID | None = None


class DailyQuestionAdminDay(BaseModel):
    """A day as the admin console shows it.

    Carries `overridden` rather than `selected_by`: that an admin chose the
    question is the useful fact, and *which* admin is not something to leave
    sitting on a shape that might later be reused student-side.
    """

    for_date: date
    question: DailyQuestionPrompt | None
    overridden: bool
    answer_count: int
    # False once anyone has answered, since re-pointing the day would orphan
    # their score -- the attempts table's composite foreign key enforces this
    # too, so the check and the constraint agree.
    can_change: bool


class DailyQuestionAdminResponse(BaseModel):
    server_today: date
    #: How many days past `server_today` these rows cover. The console builds
    #: its window from this rather than from its own constant, so the two
    #: cannot disagree about how far ahead the schedule runs.
    horizon_days: int
    days: list[DailyQuestionAdminDay]
