from app.documents.diffing import hash_bytes, match_blocks_by_text, match_by_hash


def test_match_by_hash_no_changes() -> None:
    hashes = ["a", "b", "c"]
    assert match_by_hash(hashes, hashes) == [(0, 0), (1, 1), (2, 2)]


def test_match_by_hash_insert_before_unchanged() -> None:
    # A new item inserted before "b" and "c" -- both should still match at
    # their new (shifted) positions, not just by old index.
    old = ["a", "b", "c"]
    new = ["a", "x", "b", "c"]
    assert match_by_hash(old, new) == [(0, 0), (1, 2), (2, 3)]


def test_match_by_hash_delete() -> None:
    old = ["a", "b", "c"]
    new = ["a", "c"]
    assert match_by_hash(old, new) == [(0, 0), (2, 1)]


def test_match_by_hash_reorder() -> None:
    old = ["a", "b", "c"]
    new = ["c", "a", "b"]
    # SequenceMatcher finds the longest matching run -- "a", "b" stay
    # together as a contiguous match; "c" alone doesn't also match since a
    # given old index can only be used once.
    assert match_by_hash(old, new) == [(0, 1), (1, 2)]


def test_match_by_hash_all_changed() -> None:
    assert match_by_hash(["a", "b"], ["x", "y"]) == []


def test_match_by_hash_tolerates_many_repeated_values() -> None:
    # Regression guard for autojunk: SequenceMatcher's default heuristic
    # would refuse to match a value that makes up >1% of a long sequence,
    # which misfires on documents with many short/repeated blocks.
    old = ["same"] * 200 + ["unique-old"]
    new = ["same"] * 200 + ["unique-old"]
    pairs = match_by_hash(old, new)
    assert (200, 200) in pairs
    assert len(pairs) == 201


def test_match_blocks_by_text_insert_before_unchanged() -> None:
    old_blocks = [
        {"type": "paragraph", "text": "First paragraph."},
        {"type": "paragraph", "text": "Second paragraph."},
    ]
    new_blocks = [
        {"type": "paragraph", "text": "First paragraph."},
        {"type": "paragraph", "text": "Inserted paragraph."},
        {"type": "paragraph", "text": "Second paragraph."},
    ]
    assert match_blocks_by_text(old_blocks, new_blocks) == [(0, 0), (1, 2)]


def test_match_blocks_by_text_excludes_image_blocks() -> None:
    old_blocks = [
        {"type": "paragraph", "text": "Hello."},
        {"type": "image", "image_path": "a.png"},
    ]
    new_blocks = [
        {"type": "paragraph", "text": "Hello."},
        {"type": "image", "image_path": "a.png"},
    ]
    # The image block is identical, but it's never matched -- it's excluded
    # from consideration entirely, by design.
    assert match_blocks_by_text(old_blocks, new_blocks) == [(0, 0)]


def test_match_blocks_by_text_changed_block_is_dropped() -> None:
    old_blocks = [{"type": "paragraph", "text": "Original."}]
    new_blocks = [{"type": "paragraph", "text": "Edited."}]
    assert match_blocks_by_text(old_blocks, new_blocks) == []


def test_hash_bytes_is_deterministic() -> None:
    assert hash_bytes(b"hello") == hash_bytes(b"hello")
    assert hash_bytes(b"hello") != hash_bytes(b"world")
