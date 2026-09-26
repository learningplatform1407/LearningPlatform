"""Heuristic cloze-span generation from a document's extracted paragraph
blocks -- deterministic (no randomness, no AI call) so re-running it against
the same content always proposes the same spans. See app/cloze/service.py
for where this gets invoked and cached as ClozeCard rows.
"""

import re
from typing import Any, TypedDict

# A conservative list of common English function words, excluded so cloze
# blanks land on words actually worth recalling (terms, not glue).
_STOPWORDS = frozenset(
    [
        "the",
        "and",
        "of",
        "to",
        "a",
        "in",
        "is",
        "that",
        "it",
        "for",
        "on",
        "with",
        "as",
        "are",
        "this",
        "by",
        "an",
        "be",
        "or",
        "from",
        "at",
        "was",
        "were",
        "which",
        "their",
        "its",
        "into",
        "can",
        "not",
        "have",
        "has",
        "had",
        "will",
        "would",
        "could",
        "should",
        "there",
        "these",
        "those",
        "such",
        "than",
        "then",
        "when",
        "where",
        "who",
        "what",
        "why",
        "how",
        "all",
        "each",
        "other",
        "some",
        "any",
        "more",
        "most",
        "no",
        "so",
        "if",
        "but",
        "because",
        "while",
        "about",
        "over",
        "between",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "up",
        "down",
        "out",
        "off",
        "again",
        "further",
        "once",
        "here",
        "also",
        "both",
        "only",
        "own",
        "same",
        "too",
        "very",
        "just",
    ]
)

_MIN_WORD_LENGTH = 5
_MIN_NUMBER_DIGITS = 2
_MAX_SPANS_PER_PARAGRAPH = 2

# Matches a run of letters/apostrophes (a "word") or a run of digits (a
# "number"), whichever occurs first at each position -- iterated in source
# order, so candidate offsets stay strictly increasing within a block.
_TOKEN_RE = re.compile(r"[A-Za-z']+|\d+")


class ClozeSpanData(TypedDict):
    block_index: int
    start_offset: int
    end_offset: int
    answer_text: str


def generate_cloze_spans(blocks: list[dict[str, Any]]) -> list[ClozeSpanData]:
    """Picks up to `_MAX_SPANS_PER_PARAGRAPH` candidate words/numbers per
    paragraph block -- headings and images are never touched. Purely a
    function of `blocks`, so it's directly unit-testable and idempotent:
    calling it twice on the same content always returns the same spans."""
    spans: list[ClozeSpanData] = []
    for block_index, block in enumerate(blocks):
        if block.get("type") != "paragraph":
            continue
        text = block.get("text") or ""
        found_in_block = 0
        for match in _TOKEN_RE.finditer(text):
            if found_in_block >= _MAX_SPANS_PER_PARAGRAPH:
                break
            token = match.group()
            if token.isdigit():
                if len(token) < _MIN_NUMBER_DIGITS:
                    continue
            elif len(token) < _MIN_WORD_LENGTH or token.lower() in _STOPWORDS:
                continue
            spans.append(
                ClozeSpanData(
                    block_index=block_index,
                    start_offset=match.start(),
                    end_offset=match.end(),
                    answer_text=token,
                )
            )
            found_in_block += 1
    return spans
