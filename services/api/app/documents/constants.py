from enum import StrEnum


class DocumentVersionStatus(StrEnum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


DOCUMENTS_BUCKET = "documents"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # Supabase's free-tier max upload size.
ALLOWED_MIME_TYPES = {"application/pdf"}
