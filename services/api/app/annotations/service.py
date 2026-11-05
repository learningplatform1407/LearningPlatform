import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.annotations.constants import DEFAULT_HIGHLIGHT_COLOR, AnnotationType
from app.annotations.models import DocumentAnnotation
from app.annotations.schemas import AnnotationCreateRequest, AnnotationUpdateRequest
from app.auth.schemas import AuthenticatedUser
from app.common.errors import ApiError
from app.documents.models import Document
from app.users.service import get_or_create_profile


def _get_current_version_id(db: Session, document_id: uuid.UUID) -> uuid.UUID:
    document = db.get(Document, document_id)
    if document is None or document.current_version_id is None:
        raise ApiError(404, "not_found", "Document not found")
    return document.current_version_id


def list_annotations(
    db: Session, document_id: uuid.UUID, user_id: uuid.UUID
) -> list[DocumentAnnotation]:
    version_id = _get_current_version_id(db, document_id)
    return list(
        db.scalars(
            select(DocumentAnnotation)
            .where(
                DocumentAnnotation.document_version_id == version_id,
                DocumentAnnotation.user_id == user_id,
            )
            .order_by(DocumentAnnotation.block_index, DocumentAnnotation.start_offset)
        )
    )


def create_annotation(
    db: Session, document_id: uuid.UUID, user: AuthenticatedUser, data: AnnotationCreateRequest
) -> DocumentAnnotation:
    version_id = _get_current_version_id(db, document_id)
    # A profile row must exist before we can FK an annotation to it — a user
    # could in principle hit this endpoint before ever calling GET /v1/me,
    # which is what normally creates it (same FK-ordering class of bug as
    # get_or_create_profile's own docstring already guards against elsewhere).
    profile = get_or_create_profile(db, user)

    color = data.color
    if data.type == AnnotationType.HIGHLIGHT.value and color is None:
        color = DEFAULT_HIGHLIGHT_COLOR

    annotation = DocumentAnnotation(
        document_version_id=version_id,
        user_id=profile.id,
        type=data.type,
        block_index=data.block_index,
        start_offset=data.start_offset,
        end_offset=data.end_offset,
        note_text=data.note_text,
        color=color,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


def update_annotation(
    db: Session,
    document_id: uuid.UUID,
    annotation_id: uuid.UUID,
    user_id: uuid.UUID,
    data: AnnotationUpdateRequest,
) -> DocumentAnnotation:
    version_id = _get_current_version_id(db, document_id)
    annotation = db.get(DocumentAnnotation, annotation_id)
    # Someone else's annotation, or one on an older version of the lesson,
    # is "not found" from here -- the same answer list_annotations gives.
    if (
        annotation is None
        or annotation.user_id != user_id
        or annotation.document_version_id != version_id
    ):
        raise ApiError(404, "not_found", "Annotation not found")

    fields = data.model_fields_set
    if "note_text" in fields:
        if annotation.type != AnnotationType.MARGIN_NOTE.value:
            raise ApiError(422, "invalid_field", "Only a margin note has text")
        annotation.note_text = data.note_text
    if "color" in fields:
        if annotation.type != AnnotationType.HIGHLIGHT.value:
            raise ApiError(422, "invalid_field", "Only a highlight has a colour")
        annotation.color = data.color or DEFAULT_HIGHLIGHT_COLOR
    db.commit()
    db.refresh(annotation)
    return annotation


def delete_annotation(db: Session, annotation_id: uuid.UUID, user_id: uuid.UUID) -> None:
    annotation = db.get(DocumentAnnotation, annotation_id)
    if annotation is None or annotation.user_id != user_id:
        raise ApiError(404, "not_found", "Annotation not found")
    db.delete(annotation)
    db.commit()
