"""PDF text extraction into reflowable heading/paragraph blocks.

Runs once at upload time (see app/documents/service.py) — the result is
stored on DocumentVersion.extracted_content and read from there for every
subsequent view, so the PDF itself is never re-parsed on read.
"""

from statistics import median
from typing import Literal, TypedDict

import pymupdf

# A block's average font size needs to exceed the document's median body
# size by this ratio, and be short enough, to count as a heading rather than
# a paragraph that just happens to run a little large.
_HEADING_SIZE_RATIO = 1.15
_HEADING_MAX_CHARS = 120


class ExtractedBlock(TypedDict):
    type: Literal["heading", "paragraph"]
    text: str
    page: int


class ExtractionError(Exception):
    pass


def extract_pdf(pdf_bytes: bytes) -> list[ExtractedBlock]:
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise ExtractionError(f"Could not open PDF: {exc}") from exc

    raw_blocks: list[tuple[int, str, float]] = []
    all_sizes: list[float] = []

    for page_index in range(doc.page_count):
        page = doc[page_index]
        page_dict = page.get_text("dict")
        for block in page_dict["blocks"]:
            lines = block.get("lines")
            if not lines:
                continue
            spans = [span for line in lines for span in line["spans"]]
            text = "".join(span["text"] for span in spans).strip()
            if not text:
                continue
            sizes = [span["size"] for span in spans if span["text"].strip()]
            if not sizes:
                continue
            avg_size = sum(sizes) / len(sizes)
            raw_blocks.append((page_index + 1, text, avg_size))
            all_sizes.extend(sizes)

    if not raw_blocks:
        raise ExtractionError("No extractable text found (scanned/image-only PDF?)")

    body_size = median(all_sizes)

    blocks: list[ExtractedBlock] = []
    for page_number, text, avg_size in raw_blocks:
        is_heading = avg_size >= body_size * _HEADING_SIZE_RATIO and len(text) <= _HEADING_MAX_CHARS
        blocks.append(
            {
                "type": "heading" if is_heading else "paragraph",
                "text": text,
                "page": page_number,
            }
        )
    return blocks
