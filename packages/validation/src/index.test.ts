import { describe, expect, test } from "vitest";

import {
  annotationCreateRequestSchema,
  annotationResponseSchema,
  chapterCreateRequestSchema,
  chapterResponseSchema,
  documentCreateRequestSchema,
  documentResponseSchema,
  documentSummaryResponseSchema,
  meResponseSchema,
  recentLessonResponseSchema,
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
    const payload = { storage_path: "509e04ac-28b2-41ac-85bd-3989d3d656a8.pdf", token: "eyJraWQi..." };
    expect(uploadUrlResponseSchema.safeParse(payload).success).toBe(true);
  });

  test("rejects a missing token", () => {
    expect(
      uploadUrlResponseSchema.safeParse({ storage_path: "x.pdf" }).success,
    ).toBe(false);
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
      title: "Intro to Systems",
      order_index: 0,
      lesson_count: 3,
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

describe("documentCreateRequestSchema", () => {
  test("accepts a request with a chapter_id", () => {
    const payload = {
      title: "Lecture 1",
      storage_path: "x.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      checksum: "abc",
      chapter_id: "2879a273-236d-429e-985b-db6c43672a1b",
    };

    expect(documentCreateRequestSchema.safeParse(payload).success).toBe(true);
  });

  test("accepts a request with no chapter_id (Uncategorized)", () => {
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
