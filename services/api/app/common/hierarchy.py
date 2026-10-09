"""The Book -> Chapter -> Sub-chapter -> Lesson tree, loaded in four queries.

Every dashboard that overlays per-lesson data on the course structure needs
this walk: the cloze Review summary, the Flashcards hub, and the Question
Bank tree. Each one rebuilt it with nested loops -- `list_chapters` per book,
`list_sub_chapters` per chapter, `list_documents` per sub-chapter -- which is
`1 + B + B*C + B*C*S` queries. At five books of ten chapters of five
sub-chapters that is 306 round-trips to render one dashboard, and it grows
with the content.

This loads each level once and assembles the tree in Python, so the cost is
four queries no matter how big the course gets.

Deliberately returns ORM rows rather than response schemas: the callers build
different shapes over the same structure (one counts due cloze words, another
due and new flashcards), and the walk has no opinion about what is layered on
top of it.

Ordering matches the per-level helpers it replaces exactly -- `order_index` at
every level, with documents additionally tie-broken by `created_at`
descending -- so a dashboard's rows do not silently reshuffle.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.books.models import Book
from app.chapters.models import Chapter
from app.documents.models import Document
from app.sub_chapters.models import SubChapter


@dataclass(frozen=True)
class SubChapterNode:
    sub_chapter: SubChapter
    documents: list[Document]


@dataclass(frozen=True)
class ChapterNode:
    chapter: Chapter
    sub_chapters: list[SubChapterNode]


@dataclass(frozen=True)
class BookNode:
    book: Book
    chapters: list[ChapterNode]


@dataclass(frozen=True)
class ContentTree:
    books: list[BookNode]
    # Lessons with `sub_chapter_id IS NULL` -- the same Uncategorized bucket
    # the Library page shows, which sits outside the book tree entirely.
    uncategorized_documents: list[Document]


def load_content_tree(db: Session) -> ContentTree:
    """Four queries: all books, all chapters, all sub-chapters, all lessons.

    Children are grouped onto their parents by id in Python. An orphan -- a
    chapter whose book was deleted concurrently, say -- is simply absent from
    the tree rather than crashing the walk.
    """
    books = list(db.scalars(select(Book).order_by(Book.order_index)))
    chapters = list(db.scalars(select(Chapter).order_by(Chapter.order_index)))
    sub_chapters = list(db.scalars(select(SubChapter).order_by(SubChapter.order_index)))
    documents = list(
        db.scalars(select(Document).order_by(Document.order_index, Document.created_at.desc()))
    )

    documents_by_sub_chapter: dict[uuid.UUID, list[Document]] = {}
    uncategorized: list[Document] = []
    for document in documents:
        if document.sub_chapter_id is None:
            uncategorized.append(document)
        else:
            documents_by_sub_chapter.setdefault(document.sub_chapter_id, []).append(document)

    sub_chapters_by_chapter: dict[uuid.UUID, list[SubChapterNode]] = {}
    for sub_chapter in sub_chapters:
        sub_chapters_by_chapter.setdefault(sub_chapter.chapter_id, []).append(
            SubChapterNode(
                sub_chapter=sub_chapter,
                documents=documents_by_sub_chapter.get(sub_chapter.id, []),
            )
        )

    chapters_by_book: dict[uuid.UUID, list[ChapterNode]] = {}
    for chapter in chapters:
        chapters_by_book.setdefault(chapter.book_id, []).append(
            ChapterNode(
                chapter=chapter,
                sub_chapters=sub_chapters_by_chapter.get(chapter.id, []),
            )
        )

    return ContentTree(
        books=[BookNode(book=book, chapters=chapters_by_book.get(book.id, [])) for book in books],
        uncategorized_documents=uncategorized,
    )
