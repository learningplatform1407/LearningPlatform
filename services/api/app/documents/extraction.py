"""PDF text + image extraction into reflowable blocks.

Runs once at upload time (see app/documents/service.py) — the result is
stored on DocumentVersion.extracted_content and read from there for every
subsequent view, so the PDF itself is never re-parsed on read.

This module is deliberately Storage-free (pure function of PDF bytes ->
blocks) so it's unit-testable without mocking network calls — image blocks
carry raw bytes here, and app/documents/service.py is what uploads them and
swaps the bytes for a Storage path before anything is persisted.
"""

from statistics import median
from typing import Literal, NotRequired, TypedDict

import pymupdf

# A block's average font size needs to exceed the document's median body
# size by this ratio, and be short enough, to count as a heading rather than
# a paragraph that just happens to run a little large.
_HEADING_SIZE_RATIO = 1.15
_HEADING_MAX_CHARS = 120

# Images rendered smaller than this (in PDF points — ~1/72in, close enough to
# px for a rough threshold) in either on-page dimension are almost always
# bullet icons/watermarks rather than real figures worth rendering.
_MIN_IMAGE_DIMENSION = 20


class ExtractedBlock(TypedDict):
    type: Literal["heading", "paragraph", "image"]
    page: int
    text: NotRequired[str]
    image_bytes: NotRequired[bytes]
    ext: NotRequired[str]


class ExtractionError(Exception):
    pass


def extract_pdf(pdf_bytes: bytes) -> list[ExtractedBlock]:
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise ExtractionError(f"Could not open PDF: {exc}") from exc

    # Two passes: the first walks every page once, in order, recording each
    # block as either pending text (page, text, avg font size) or a
    # ready-to-emit image block; the second classifies the pending text
    # blocks as heading/paragraph using the median size across the whole
    # document, which isn't known until the first pass finishes.
    pending: list[tuple[int, str, float] | ExtractedBlock] = []
    all_sizes: list[float] = []

    for page_index in range(doc.page_count):
        page = doc[page_index]
        page_dict = page.get_text("dict")
        for block in page_dict["blocks"]:
            if block.get("type") == 1:
                # `width`/`height` on an image block are the *source* pixmap's
                # raw pixel dimensions, not how large it's actually rendered
                # on the page — a tiny icon stretched to fill a page reports
                # as small, and a huge photo shrunk to a thumbnail reports as
                # large. `bbox` is the block's actual on-page rect, in points,
                # which is what "is this a real figure" should be judged on.
                x0, y0, x1, y1 = block.get("bbox", (0, 0, 0, 0))
                if (x1 - x0) < _MIN_IMAGE_DIMENSION or (y1 - y0) < _MIN_IMAGE_DIMENSION:
                    continue
                image_bytes = block.get("image")
                ext = block.get("ext")
                if not image_bytes or not ext:
                    continue
                pending.append(
                    ExtractedBlock(
                        type="image",
                        page=page_index + 1,
                        image_bytes=image_bytes,
                        ext=ext,
                    )
                )
                continue

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
            pending.append((page_index + 1, text, avg_size))
            all_sizes.extend(sizes)

    if not all_sizes:
        raise ExtractionError("No extractable text found (scanned/image-only PDF?)")

    body_size = median(all_sizes)

    blocks: list[ExtractedBlock] = []
    for item in pending:
        if isinstance(item, tuple):
            page_number, text, avg_size = item
            is_heading = (
                avg_size >= body_size * _HEADING_SIZE_RATIO and len(text) <= _HEADING_MAX_CHARS
            )
            block_type: Literal["heading", "paragraph"] = "heading" if is_heading else "paragraph"
            blocks.append(ExtractedBlock(type=block_type, text=text, page=page_number))
        else:
            blocks.append(item)
    return blocks
