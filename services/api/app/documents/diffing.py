"""Content-hash matching for the lecture-text replace flow.

Used only when an admin replaces a lesson's lecture text (not the lecture
PDF, which never diffs -- see service.py::upsert_lecture_pdf) so that
highlights/margin-notes on paragraphs that didn't actually change survive
the replace, even if their position shifted (e.g. a paragraph inserted
above them). Pure and stdlib-only so it's independently unit-testable.
"""

import hashlib
from difflib import SequenceMatcher
from typing import Any


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def match_by_hash(old_hashes: list[str], new_hashes: list[str]) -> list[tuple[int, int]]:
    """Position-shift-tolerant matching: an unchanged item that moved (e.g.
    a block pushed down by an inserted paragraph above it) still matches.

    `autojunk=False` is required -- SequenceMatcher's default heuristic
    treats any hash value appearing in more than 1% of a long sequence as
    "noise" and refuses to match it, which misfires on documents with many
    short/repeated text blocks (e.g. bullet headers)."""
    matcher = SequenceMatcher(a=old_hashes, b=new_hashes, autojunk=False)
    return [
        (block.a + offset, block.b + offset)
        for block in matcher.get_matching_blocks()
        for offset in range(block.size)
    ]


def match_blocks_by_text(
    old_blocks: list[dict[str, Any]], new_blocks: list[dict[str, Any]]
) -> list[tuple[int, int]]:
    """Text blocks only -- image blocks are excluded entirely, so any
    annotation anchored to one always dies with the old version (matching
    them would require re-downloading the old image bytes from Storage just
    to hash them, for a case that's rare to begin with)."""
    old_text = [
        (i, hash_bytes(block["text"].encode()))
        for i, block in enumerate(old_blocks)
        if block.get("type") != "image" and block.get("text")
    ]
    new_text = [
        (i, hash_bytes(block["text"].encode()))
        for i, block in enumerate(new_blocks)
        if block.get("type") != "image" and block.get("text")
    ]
    pairs = match_by_hash([h for _, h in old_text], [h for _, h in new_text])
    return [(old_text[old_i][0], new_text[new_i][0]) for old_i, new_i in pairs]
