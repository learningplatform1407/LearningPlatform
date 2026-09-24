import { describe, expect, test } from "vitest";

import {
  annotationCreateRequestSchema,
  annotationResponseSchema,
  bookCreateRequestSchema,
  bookResponseSchema,
  chapterCreateRequestSchema,
  chapterResponseSchema,
  documentCreateRequestSchema,
  documentResponseSchema,
  documentSummaryResponseSchema,
  flashcardResponseSchema,
  questionImportRequestSchema,
  questionImportResultSchema,
  meResponseSchema,
  notebookEntryCreateRequestSchema,
  notebookEntryResponseSchema,
  notebookEntryUpdateRequestSchema,
  questionCreateRequestSchema,
  questionResponseSchema,
  questionUpdateRequestSchema,
  quizResponseSchema,
  recentLessonResponseSchema,
  subChapterCreateRequestSchema,
  subChapterResponseSchema,
  tagResponseSchema,
  uploadUrlResponseSchema,
} from "./index";

describe("meResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "647e7c73-13cc-490b-ab6c-1d611b323984",
      email: "test@example.com",
      display_name: null,
      avatar_url: null,
      university: "MIT",
      role: "student",
      created_at: "2026-08-25T23:17:58.049368Z",
      updated_at: "2026-08-25T23:18:04.552657Z",
      settings: { theme: "system", notifications_enabled: true, language: "en" },
    };

    expect(meResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects a malformed payload", () => {
    const payload = {
      id: "647e7c73-13cc-490b-ab6c-1d611b323984",
      email: "test@example.com",
      // missing display_name, avatar_url, university, timestamps
      settings: { theme: "system" }, // missing notifications_enabled
    };

    expect(meResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe("documentResponseSchema", () => {
  test("accepts a ready document with extracted blocks", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-03T22:10:05.372022Z",
      updated_at: "2026-09-03T22:10:05.372022Z",
      current_version: {
        id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [
            { type: "heading", text: "Introduction to Systems", page: 1 },
            { type: "paragraph", text: "This lecture covers...", page: 1 },
          ],
        },
        created_at: "2026-09-03T22:10:05.372022Z",
      },
    };

    expect(documentResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a document with no current version yet", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-03T22:10:05.372022Z",
      updated_at: "2026-09-03T22:10:05.372022Z",
      current_version: null,
    };

    expect(documentResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a document with a sub_chapter breadcrumb", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-03T22:10:05.372022Z",
      updated_at: "2026-09-03T22:10:05.372022Z",
      current_version: null,
      sub_chapter: {
        id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
        title: "Sub A",
        chapter: {
          id: "20501741-6a13-4701-9ee5-b70d713f5a85",
          book_id: "8e6b0a1d-4b4a-4a3e-9c1e-2f7b6d5a4c3b",
          title: "Chapter One",
        },
      },
    };

    expect(documentResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a document with a null sub_chapter (Uncategorized)", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-03T22:10:05.372022Z",
      updated_at: "2026-09-03T22:10:05.372022Z",
      current_version: null,
      sub_chapter: null,
    };

    expect(documentResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts an image block (no text, has image_path)", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-03T22:10:05.372022Z",
      updated_at: "2026-09-03T22:10:05.372022Z",
      current_version: {
        id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
        status: "ready",
        error_message: null,
        extracted_content: {
          blocks: [
            { type: "heading", text: "Introduction", page: 1 },
            { type: "image", page: 1, image_path: "70daa13f.../images/1.png" },
            { type: "paragraph", text: "After the figure.", page: 1 },
          ],
        },
        created_at: "2026-09-03T22:10:05.372022Z",
      },
    };

    expect(documentResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects an unknown block type", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-03T22:10:05.372022Z",
      updated_at: "2026-09-03T22:10:05.372022Z",
      current_version: {
        id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
        status: "ready",
        error_message: null,
        extracted_content: { blocks: [{ type: "diagram", text: "x", page: 1 }] },
        created_at: "2026-09-03T22:10:05.372022Z",
      },
    };

    expect(documentResponseSchema.safeParse(payload).success).toBe(false);
  });

  test("rejects an invalid status", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-03T22:10:05.372022Z",
      updated_at: "2026-09-03T22:10:05.372022Z",
      current_version: {
        id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
        status: "uploading", // not one of processing/ready/failed
        error_message: null,
        extracted_content: null,
        created_at: "2026-09-03T22:10:05.372022Z",
      },
    };

    expect(documentResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe("documentSummaryResponseSchema", () => {
  test("accepts a summary with a null status (no version yet)", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_at: "2026-09-03T22:10:05.372022Z",
      status: null,
    };

    expect(documentSummaryResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("uploadUrlResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      storage_path: "509e04ac-28b2-41ac-85bd-3989d3d656a8.pdf",
      token: "eyJraWQi...",
    };
    expect(uploadUrlResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects a missing token", () => {
    expect(uploadUrlResponseSchema.safeParse({ storage_path: "x.pdf" }).success).toBe(false);
  });
});

describe("annotationResponseSchema", () => {
  test("accepts a range-anchored highlight", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      document_version_id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      type: "highlight",
      block_index: 0,
      start_offset: 0,
      end_offset: 5,
      note_text: null,
      color: "yellow",
      created_at: "2026-09-03T22:10:05.372022Z",
    };

    expect(annotationResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a block-level margin note with no offsets", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      document_version_id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      type: "margin_note",
      block_index: 2,
      start_offset: null,
      end_offset: null,
      note_text: "Check this later",
      color: null,
      created_at: "2026-09-03T22:10:05.372022Z",
    };

    expect(annotationResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects an unknown annotation type", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      document_version_id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      type: "sticky_note",
      block_index: 0,
      start_offset: null,
      end_offset: null,
      note_text: null,
      color: null,
      created_at: "2026-09-03T22:10:05.372022Z",
    };

    expect(annotationResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe("annotationCreateRequestSchema", () => {
  test("accepts a minimal highlight request (offsets required by convention, not schema)", () => {
    const payload = { type: "highlight", block_index: 0, start_offset: 0, end_offset: 5 };
    expect(annotationCreateRequestSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a block-level margin note with no offsets", () => {
    const payload = { type: "margin_note", block_index: 1, note_text: "Remember this" };
    expect(annotationCreateRequestSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects a missing block_index", () => {
    expect(annotationCreateRequestSchema.safeParse({ type: "highlight" }).success).toBe(false);
  });
});

describe("chapterResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      book_id: "d3a9e3d1-5c3a-4b9e-9e3a-3d1c5a3b9e3a",
      title: "Intro to Systems",
      order_index: 0,
      sub_chapter_count: 3,
      created_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(chapterResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("chapterCreateRequestSchema", () => {
  test("accepts a title-only request", () => {
    expect(chapterCreateRequestSchema.safeParse({ title: "Intro to Systems" }).success).toBe(true);
  });

  test("rejects a missing title", () => {
    expect(chapterCreateRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("bookResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Main Library",
      order_index: 0,
      chapter_count: 1,
      created_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(bookResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("bookCreateRequestSchema", () => {
  test("accepts a title-only request", () => {
    expect(bookCreateRequestSchema.safeParse({ title: "Main Library" }).success).toBe(true);
  });

  test("rejects a missing title", () => {
    expect(bookCreateRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("documentCreateRequestSchema", () => {
  test("accepts a request with a sub_chapter_id", () => {
    const payload = {
      title: "Lecture 1",
      storage_path: "x.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      checksum: "abc",
      sub_chapter_id: "2879a273-236d-429e-985b-db6c43672a1b",
    };

    expect(documentCreateRequestSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a request with no sub_chapter_id (Uncategorized)", () => {
    const payload = {
      title: "Lecture 1",
      storage_path: "x.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      checksum: "abc",
    };

    expect(documentCreateRequestSchema.safeParse(payload).success).toBe(true);
  });
});

describe("recentLessonResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Intro to Systems",
      created_at: "2026-09-08T22:10:05.372022Z",
      status: "ready",
      last_viewed_at: "2026-09-08T22:12:00.000000Z",
    };

    expect(recentLessonResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("subChapterResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      chapter_id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Sub A",
      order_index: 0,
      lesson_count: 2,
      created_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(subChapterResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("subChapterCreateRequestSchema", () => {
  test("accepts a title-only request", () => {
    expect(subChapterCreateRequestSchema.safeParse({ title: "Sub A" }).success).toBe(true);
  });

  test("rejects a missing title", () => {
    expect(subChapterCreateRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("notebookEntryResponseSchema", () => {
  test("accepts a text entry", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      type: "text",
      content: "Idea for the project",
      strokes: null,
      source_document_id: null,
      created_at: "2026-09-08T22:10:05.372022Z",
      updated_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(notebookEntryResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a drawing entry with real stroke data", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      type: "drawing",
      content: null,
      strokes: [
        {
          color: "#1a1a1a",
          width: 0.008,
          points: [
            { x: 0.12, y: 0.3, pressure: 0.5 },
            { x: 0.2, y: 0.35, pressure: 0.7 },
            { x: 0.25, y: 0.4 },
          ],
        },
        {
          color: "#fbbf24",
          width: 0.02,
          points: [{ x: 0.5, y: 0.5, pressure: 1 }],
        },
      ],
      source_document_id: null,
      created_at: "2026-09-08T22:10:05.372022Z",
      updated_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(notebookEntryResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a note created from the lesson reader, with source_document_id set", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      type: "text",
      content: "Jotted while reading",
      strokes: null,
      source_document_id: "2879a273-236d-429e-985b-db6c43672a1b",
      created_at: "2026-09-08T22:10:05.372022Z",
      updated_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(notebookEntryResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects an unknown type", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      type: "audio",
      content: null,
      strokes: null,
      source_document_id: null,
      created_at: "2026-09-08T22:10:05.372022Z",
      updated_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(notebookEntryResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe("notebookEntryCreateRequestSchema", () => {
  test("accepts a text-only request", () => {
    expect(
      notebookEntryCreateRequestSchema.safeParse({ type: "text", content: "New note" }).success,
    ).toBe(true);
  });

  test("accepts a drawing request with strokes", () => {
    const payload = {
      type: "drawing",
      strokes: [{ color: "#000", width: 0.01, points: [{ x: 0.1, y: 0.1 }] }],
    };

    expect(notebookEntryCreateRequestSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts an optional source_document_id", () => {
    const payload = {
      type: "text",
      content: "Jotted while reading",
      source_document_id: "2879a273-236d-429e-985b-db6c43672a1b",
    };

    expect(notebookEntryCreateRequestSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects a missing type", () => {
    expect(notebookEntryCreateRequestSchema.safeParse({ content: "x" }).success).toBe(false);
  });
});

describe("notebookEntryUpdateRequestSchema", () => {
  test("accepts a content-only update", () => {
    expect(notebookEntryUpdateRequestSchema.safeParse({ content: "Revised" }).success).toBe(true);
  });

  test("accepts an empty update (no-op)", () => {
    expect(notebookEntryUpdateRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe("quizResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      document_id: "2879a273-236d-429e-985b-db6c43672a1b",
      title: "Chapter 1 Quiz",
      created_at: "2026-09-08T22:10:05.372022Z",
    };

    expect(quizResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("flashcardResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      document_id: "2879a273-236d-429e-985b-db6c43672a1b",
      front_text: "What is a CDN?",
      back_text: "A content delivery network.",
      order_index: 0,
    };

    expect(flashcardResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("questionResponseSchema", () => {
  test("accepts a real backend-shaped multi-select question", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      external_id: "cardio-001",
      document_id: null,
      prompt: "Which of the following reduce cardiac preload?",
      kind: "multi",
      scoring_scheme: "multi_5_per_option",
      options: [
        { id: "a", text: "Nitroglycerin" },
        { id: "b", text: "Furosemide" },
      ],
      correct_option_ids: ["a", "b"],
      rationales: { a: "Venodilation reduces venous return." },
      explanation: null,
      difficulty: "medium",
      status: "published",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-23T14:05:11Z",
      updated_at: "2026-09-23T14:05:11Z",
    };

    expect(questionResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects an unknown kind", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      external_id: null,
      document_id: null,
      prompt: "x",
      kind: "true_false",
      scoring_scheme: "single_4",
      options: [],
      correct_option_ids: [],
      rationales: {},
      explanation: null,
      difficulty: "medium",
      status: "draft",
      created_by: "20501741-6a13-4701-9ee5-b70d713f5a85",
      created_at: "2026-09-23T14:05:11Z",
      updated_at: "2026-09-23T14:05:11Z",
    };

    expect(questionResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe("questionCreateRequestSchema", () => {
  test("accepts the minimal required fields, defaults omitted", () => {
    const payload = {
      prompt: "Which drug class lowers preload?",
      kind: "single",
      scoring_scheme: "single_4",
      options: [
        { id: "a", text: "Nitrates" },
        { id: "b", text: "Vasopressors" },
      ],
      correct_option_ids: ["a"],
    };

    expect(questionCreateRequestSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects missing correct_option_ids", () => {
    const payload = {
      prompt: "x",
      kind: "single",
      scoring_scheme: "single_4",
      options: [{ id: "a", text: "x" }],
    };

    expect(questionCreateRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe("questionUpdateRequestSchema", () => {
  test("accepts an empty update (no-op)", () => {
    expect(questionUpdateRequestSchema.safeParse({}).success).toBe(true);
  });

  test("accepts a partial update touching only explanation", () => {
    expect(
      questionUpdateRequestSchema.safeParse({ explanation: "Because venodilation." }).success,
    ).toBe(true);
  });
});

describe("tagResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "70daa13f-1836-4b32-85b3-6dbe96388f3e",
      slug: "cardiology",
      label: "Cardiology",
      question_count: 42,
    };

    expect(tagResponseSchema.safeParse(payload).success).toBe(true);
  });
});

describe("questionImportRequestSchema", () => {
  test("accepts a realistic bulk import payload", () => {
    const payload = {
      allow_new_tags: false,
      questions: [
        {
          external_id: "cardio-001",
          prompt: "Which of the following reduce cardiac preload?",
          kind: "multi",
          scoring_scheme: "multi_5_per_option",
          options: [
            { id: "a", text: "Nitroglycerin" },
            { id: "b", text: "Furosemide" },
          ],
          correct_option_ids: ["a", "b"],
          tags: ["cardiology", "pharmacology"],
        },
      ],
    };

    expect(questionImportRequestSchema.safeParse(payload).success).toBe(true);
  });
});

describe("questionImportResultSchema", () => {
  test("accepts a real backend-shaped payload with per-item errors", () => {
    const payload = {
      created: 1,
      updated: 0,
      skipped: 1,
      errors: [
        { index: 1, field: "correct_option_ids", message: "correct_option_ids must not be empty" },
      ],
    };

    expect(questionImportResultSchema.safeParse(payload).success).toBe(true);
  });
});
