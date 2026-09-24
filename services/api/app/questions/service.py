import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.errors import ApiError, FieldError
from app.questions.constants import MAX_IMPORT_QUESTIONS, QuestionKind, QuestionStatus
from app.questions.models import Question, QuestionTag, Tag
from app.questions.schemas import (
    ImportErrorItem,
    ImportQuestionItem,
    ImportRequest,
    ImportResult,
    OptionSchema,
    QuestionCreateRequest,
    QuestionUpdateRequest,
)
from app.questions.scoring import get_scheme

# Which kind each scheme applies to — a scoring_scheme inconsistent with the
# question's kind (single_4 on a multi, or vice versa) is rejected at import
# and at create/update, never at grading time.
_SCHEME_KIND: dict[str, str] = {"single_4": "single", "multi_5_per_option": "multi"}

# Fields the `questions` table declares NOT NULL. QuestionUpdateRequest makes
# every field optional so PATCH can omit it, but Pydantic still lets a caller
# send an explicit `null` for one of these — that must be rejected as a 422,
# not applied and left to crash as a NOT NULL constraint violation.
_REQUIRED_QUESTION_FIELDS = frozenset(
    {
        "prompt",
        "kind",
        "scoring_scheme",
        "options",
        "correct_option_ids",
        "rationales",
        "difficulty",
        "status",
    }
)


def _validate_question(
    *,
    kind: str,
    scoring_scheme: str,
    options: list[OptionSchema],
    correct_option_ids: list[str],
    rationales: dict[str, str],
) -> list[tuple[str, str]]:
    """Returns (field, message) pairs — empty means the question is valid."""
    errors: list[tuple[str, str]] = []

    option_ids = [option.id for option in options]
    if len(option_ids) != len(set(option_ids)):
        errors.append(("options", "Option ids must be unique within the question"))
    option_id_set = set(option_ids)

    if not correct_option_ids:
        errors.append(("correct_option_ids", "correct_option_ids must not be empty"))
    if len(correct_option_ids) != len(set(correct_option_ids)):
        errors.append(("correct_option_ids", "correct_option_ids must not contain duplicates"))
    for option_id in correct_option_ids:
        if option_id not in option_id_set:
            errors.append(
                ("correct_option_ids", f"'{option_id}' is not one of the question's option ids")
            )
    for option_id in rationales:
        if option_id not in option_id_set:
            errors.append(("rationales", f"'{option_id}' is not one of the question's option ids"))

    if kind == QuestionKind.SINGLE and len(set(correct_option_ids)) > 1:
        errors.append(
            ("correct_option_ids", "A single-kind question may have only one correct option")
        )

    try:
        scheme = get_scheme(scoring_scheme)
    except ValueError:
        errors.append(("scoring_scheme", f"Unknown scoring scheme: {scoring_scheme!r}"))
        return errors

    expected_kind = _SCHEME_KIND.get(scheme.key)
    if expected_kind is not None and expected_kind != kind:
        errors.append(
            ("scoring_scheme", f"scoring_scheme '{scheme.key}' is not valid for kind '{kind}'")
        )
    if scheme.required_option_count is not None and len(options) != scheme.required_option_count:
        errors.append(
            (
                "options",
                f"scoring_scheme '{scheme.key}' requires exactly "
                f"{scheme.required_option_count} options",
            )
        )

    return errors


def _resolve_tags(
    db: Session, slugs: list[str], *, allow_new: bool
) -> tuple[list[Tag], list[tuple[str, str]]]:
    errors: list[tuple[str, str]] = []
    unique_slugs = list(dict.fromkeys(slugs))
    if not unique_slugs:
        return [], errors

    existing = {tag.slug: tag for tag in db.scalars(select(Tag).where(Tag.slug.in_(unique_slugs)))}
    tags: list[Tag] = []
    for slug in unique_slugs:
        tag = existing.get(slug)
        if tag is None:
            if not allow_new:
                errors.append(("tags", f"Unknown tag slug: '{slug}'"))
                continue
            # Own SAVEPOINT: two concurrent imports can both see the slug as
            # missing and both try to create it. Postgres blocks the second
            # INSERT until the first commits, then raises a unique
            # violation rather than silently succeeding — catch that and
            # reuse the row the other transaction just created, the same
            # pattern the session-start race uses for the partial unique
            # index (docs/architecture/quizzes.md §6.2).
            tag_savepoint = db.begin_nested()
            try:
                tag = Tag(slug=slug, label=slug)
                db.add(tag)
                db.flush()
            except IntegrityError:
                tag_savepoint.rollback()
                tag = db.scalar(select(Tag).where(Tag.slug == slug))
                if tag is None:
                    raise
            else:
                tag_savepoint.commit()
            existing[slug] = tag
        tags.append(tag)
    return tags, errors


def _set_question_tags(db: Session, question_id: uuid.UUID, tags: list[Tag]) -> None:
    db.execute(delete(QuestionTag).where(QuestionTag.question_id == question_id))
    db.add_all(QuestionTag(question_id=question_id, tag_id=tag.id) for tag in tags)


def list_questions(
    db: Session,
    *,
    status: str | None = None,
    tag_id: uuid.UUID | None = None,
    document_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Question]:
    query = select(Question).order_by(Question.created_at.desc())
    if status is not None:
        query = query.where(Question.status == status)
    if document_id is not None:
        query = query.where(Question.document_id == document_id)
    if tag_id is not None:
        query = query.where(
            Question.id.in_(select(QuestionTag.question_id).where(QuestionTag.tag_id == tag_id))
        )
    query = query.limit(limit).offset(offset)
    return list(db.scalars(query))


def get_question(db: Session, question_id: uuid.UUID) -> Question | None:
    return db.get(Question, question_id)


def create_question(db: Session, created_by: uuid.UUID, data: QuestionCreateRequest) -> Question:
    errors = _validate_question(
        kind=data.kind,
        scoring_scheme=data.scoring_scheme,
        options=data.options,
        correct_option_ids=data.correct_option_ids,
        rationales=data.rationales,
    )
    tags, tag_errors = _resolve_tags(db, data.tags, allow_new=False)
    errors.extend(tag_errors)
    if errors:
        raise ApiError(
            422,
            "validation_error",
            "Question failed validation",
            details=[FieldError(field=field, message=message) for field, message in errors],
        )

    question = Question(**data.model_dump(exclude={"tags"}), created_by=created_by)
    db.add(question)
    try:
        db.flush()
    except IntegrityError as exc:
        # `external_id` is unique. Re-creating one a previous import already
        # claimed is ordinary admin behaviour, not an exceptional one —
        # uncaught it reaches the catch-all handler in main.py and surfaces
        # as a bare 500.
        db.rollback()
        raise ApiError(
            409,
            "duplicate_external_id",
            f"A question with external_id {data.external_id!r} already exists",
        ) from exc

    _set_question_tags(db, question.id, tags)
    db.commit()
    db.refresh(question)
    return question


def update_question(db: Session, question_id: uuid.UUID, data: QuestionUpdateRequest) -> Question:
    question = db.get(Question, question_id)
    if question is None:
        raise ApiError(404, "not_found", "Question not found")

    kind = data.kind if data.kind is not None else question.kind
    scoring_scheme = (
        data.scoring_scheme if data.scoring_scheme is not None else question.scoring_scheme
    )
    options = (
        data.options
        if data.options is not None
        else [OptionSchema(**option) for option in question.options]
    )
    correct_option_ids = (
        data.correct_option_ids
        if data.correct_option_ids is not None
        else question.correct_option_ids
    )
    rationales = data.rationales if data.rationales is not None else question.rationales

    errors = _validate_question(
        kind=kind,
        scoring_scheme=scoring_scheme,
        options=options,
        correct_option_ids=correct_option_ids,
        rationales=rationales,
    )
    tags: list[Tag] | None = None
    if data.tags is not None:
        tags, tag_errors = _resolve_tags(db, data.tags, allow_new=False)
        errors.extend(tag_errors)

    updates = data.model_dump(exclude_unset=True, exclude={"tags"})
    errors.extend(
        (field, f"{field} cannot be null")
        for field in _REQUIRED_QUESTION_FIELDS
        if field in updates and updates[field] is None
    )

    if errors:
        raise ApiError(
            422,
            "validation_error",
            "Question failed validation",
            details=[FieldError(field=field, message=message) for field, message in errors],
        )

    for field, value in updates.items():
        setattr(question, field, value)

    if tags is not None:
        db.flush()
        _set_question_tags(db, question.id, tags)

    db.commit()
    db.refresh(question)
    return question


def archive_question(db: Session, question_id: uuid.UUID) -> Question:
    # Never hard-deleted — an in-flight or historical quiz session's FK to
    # this row must keep resolving. DELETE archives instead.
    question = db.get(Question, question_id)
    if question is None:
        raise ApiError(404, "not_found", "Question not found")
    question.status = QuestionStatus.ARCHIVED
    db.commit()
    db.refresh(question)
    return question


def list_tags(db: Session) -> list[tuple[Tag, int]]:
    # A correlated scalar subquery per tag, counting only published
    # questions — draft/archived counts would show a tag with 10 that
    # actually yields 2 in the filter UI.
    count_subquery = (
        select(func.count(QuestionTag.question_id))
        .join(Question, Question.id == QuestionTag.question_id)
        .where(QuestionTag.tag_id == Tag.id, Question.status == QuestionStatus.PUBLISHED)
        .correlate(Tag)
        .scalar_subquery()
    )
    rows = db.execute(select(Tag, count_subquery).order_by(Tag.label)).all()
    return [(tag, count) for tag, count in rows]


def _apply_imported_question(
    db: Session,
    created_by: uuid.UUID,
    item: ImportQuestionItem,
    tags: list[Tag],
    existing: Question | None,
) -> None:
    fields = item.model_dump(exclude={"tags"})
    if existing is not None:
        for field, value in fields.items():
            setattr(existing, field, value)
        db.flush()
        # A re-import replaces the tag set rather than accumulating it.
        _set_question_tags(db, existing.id, tags)
    else:
        question = Question(**fields, created_by=created_by)
        db.add(question)
        db.flush()
        _set_question_tags(db, question.id, tags)


def import_questions(
    db: Session, created_by: uuid.UUID, data: ImportRequest, *, dry_run: bool
) -> ImportResult:
    if len(data.questions) > MAX_IMPORT_QUESTIONS:
        raise ApiError(
            400,
            "invalid_request",
            f"Cannot import more than {MAX_IMPORT_QUESTIONS} questions in one request",
        )

    created = 0
    updated = 0
    skipped = 0
    errors: list[ImportErrorItem] = []

    # A dry run reports exactly what a commit would do and writes nothing —
    # the SAVEPOINT lets it run the same insert/update code path and then
    # discard it, rather than duplicating the logic as a separate read-only
    # simulation.
    savepoint = db.begin_nested()
    for index, item in enumerate(data.questions):
        item_errors = _validate_question(
            kind=item.kind,
            scoring_scheme=item.scoring_scheme,
            options=item.options,
            correct_option_ids=item.correct_option_ids,
            rationales=item.rationales,
        )

        # Its own SAVEPOINT: with allow_new_tags, _resolve_tags below can
        # create and flush new Tag rows as a side effect of *checking* an
        # item's tags. If the item turns out invalid it's skipped, but those
        # tag rows were already flushed into the outer (batch) transaction —
        # without this rollback they'd survive a real commit as permanent
        # orphans with zero questions attached.
        item_savepoint = db.begin_nested()
        tags, tag_errors = _resolve_tags(db, item.tags, allow_new=data.allow_new_tags)
        item_errors.extend(tag_errors)
        if item_errors:
            item_savepoint.rollback()
            errors.extend(
                ImportErrorItem(index=index, field=field, message=message)
                for field, message in item_errors
            )
            skipped += 1
            continue

        existing = (
            db.scalar(select(Question).where(Question.external_id == item.external_id))
            if item.external_id
            else None
        )
        try:
            _apply_imported_question(db, created_by, item, tags, existing)
        except IntegrityError:
            # Another admin's import claimed this external_id between the
            # lookup above and this flush. Skip the one item rather than
            # letting the violation escape and 500 the whole batch — this
            # endpoint's contract is per-item errors (§7.1).
            item_savepoint.rollback()
            errors.append(
                ImportErrorItem(
                    index=index,
                    field="external_id",
                    message=f"external_id {item.external_id!r} was claimed by a concurrent import",
                )
            )
            skipped += 1
            continue

        item_savepoint.commit()
        if existing is not None:
            updated += 1
        else:
            created += 1

    if dry_run:
        savepoint.rollback()
    else:
        savepoint.commit()
        db.commit()

    return ImportResult(created=created, updated=updated, skipped=skipped, errors=errors)
