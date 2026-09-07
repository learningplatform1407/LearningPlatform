import pymupdf
import pytest

from app.documents.extraction import ExtractionError, extract_pdf

# A real, valid 4x4 solid-red PNG, generated via pymupdf.Pixmap.tobytes("png")
# rather than hand-crafted, so it's guaranteed to actually decode.
_SMALL_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000400000004080200000026930929"
    "000000097048597300000ec400000ec401952b0e1b0000001049444154789c63f8"
    "cfc000470cc47100ae930ff1d05f239e0000000049454e44ae426082"
)


def _make_pdf(*, with_image: bool = False, image_size: float = 100) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Chapter One", fontsize=22)
    page.insert_text((72, 100), "This is the first paragraph of body text.", fontsize=11)
    if with_image:
        page.insert_image(
            pymupdf.Rect(72, 130, 72 + image_size, 130 + image_size), stream=_SMALL_PNG
        )
    page.insert_text((72, 240), "This is a second paragraph, after the image.", fontsize=11)
    return doc.tobytes()


def test_classifies_heading_and_paragraph_by_font_size():
    blocks = extract_pdf(_make_pdf())

    assert [b["type"] for b in blocks] == ["heading", "paragraph", "paragraph"]
    assert blocks[0]["text"] == "Chapter One"
    assert blocks[0]["page"] == 1
    assert blocks[1]["text"] == "This is the first paragraph of body text."


def test_raises_on_a_pdf_with_no_extractable_text():
    doc = pymupdf.open()
    doc.new_page()  # blank page, no text at all
    with pytest.raises(ExtractionError, match="No extractable text"):
        extract_pdf(doc.tobytes())


def test_raises_on_bytes_that_are_not_a_pdf_at_all():
    with pytest.raises(ExtractionError, match="Could not open PDF"):
        extract_pdf(b"not a pdf")


def test_detects_an_embedded_image_in_reading_order():
    blocks = extract_pdf(_make_pdf(with_image=True))

    types = [b["type"] for b in blocks]
    assert types == ["heading", "paragraph", "image", "paragraph"]

    image_block = blocks[2]
    assert image_block["page"] == 1
    assert image_block["ext"] == "png"
    assert isinstance(image_block["image_bytes"], bytes)
    assert len(image_block["image_bytes"]) > 0


def test_filters_out_tiny_images_like_bullet_icons():
    blocks = extract_pdf(_make_pdf(with_image=True, image_size=5))

    assert [b["type"] for b in blocks] == ["heading", "paragraph", "paragraph"]


def test_multiple_images_are_all_detected():
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Body text.", fontsize=11)
    page.insert_image(pymupdf.Rect(72, 100, 172, 200), stream=_SMALL_PNG)
    page.insert_image(pymupdf.Rect(72, 220, 172, 320), stream=_SMALL_PNG)

    blocks = extract_pdf(doc.tobytes())

    image_blocks = [b for b in blocks if b["type"] == "image"]
    assert len(image_blocks) == 2
