import { describe, expect, test } from "vitest";

import { meResponseSchema } from "./index";

describe("meResponseSchema", () => {
  test("accepts a real backend-shaped payload", () => {
    const payload = {
      id: "647e7c73-13cc-490b-ab6c-1d611b323984",
      email: "test@example.com",
      display_name: null,
      avatar_url: null,
      university: "MIT",
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
