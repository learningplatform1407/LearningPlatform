from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.annotations.schemas import AnnotationCreateRequest, AnnotationResponse
from app.annotations.service import create_annotation, delete_annotation, list_annotations
from app.auth.dependencies import get_current_user
from app.auth.schemas import AuthenticatedUser
from app.db.session import get_db

router = APIRouter(prefix="/v1/documents/{document_id}/annotations", tags=["annotations"])


@router.get("", response_model=list[AnnotationResponse])
def read_annotations(
    document_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AnnotationResponse]:
    annotations = list_annotations(db, document_id, user.id)
    return [AnnotationResponse.model_validate(a) for a in annotations]


@router.post("", response_model=AnnotationResponse)
def create_annotation_route(
    document_id: UUID,
    data: AnnotationCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnnotationResponse:
    annotation = create_annotation(db, document_id, user, data)
    return AnnotationResponse.model_validate(annotation)


@router.delete("/{annotation_id}", status_code=204)
def delete_annotation_route(
    document_id: UUID,
    annotation_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    delete_annotation(db, annotation_id, user.id)
