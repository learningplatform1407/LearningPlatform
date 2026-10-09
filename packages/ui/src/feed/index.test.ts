import { describe, expect, test } from "vitest";

import { isAllowedFeedImageType, splitLinkifiedBody } from "./index";

describe("splitLinkifiedBody", () => {
  test("links an https run and leaves the surrounding text alone", () => {
    expect(splitLinkifiedBody("Watch at https://example.edu/live now.")).toEqual([
      { text: "Watch at " },
      { text: "https://example.edu/live", href: "https://example.edu/live" },
      { text: " now." },
    ]);
  });

  test("keeps sentence-ending punctuation out of the href", () => {
    expect(splitLinkifiedBody("See https://example.edu.")).toEqual([
      { text: "See " },
      { text: "https://example.edu", href: "https://example.edu" },
      { text: "." },
    ]);
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:a@b.com",
    "file:///etc/passwd",
    "intent://scan#Intent;scheme=zxing;end",
  ])("never links %s", (body) => {
    // The whole safety property of the feature: the body is free text, so
    // anything but http(s) stays inert. docs/architecture/feed.md promises
    // this, and it is implemented once so the promise has one place to hold.
    expect(splitLinkifiedBody(body).every((segment) => segment.href === undefined)).toBe(true);
  });

  test("handles several links in one body", () => {
    const segments = splitLinkifiedBody("a https://one.test b https://two.test");
    expect(
      segments.filter((segment) => segment.href !== undefined).map((segment) => segment.href),
    ).toEqual(["https://one.test", "https://two.test"]);
  });

  test("drops empty segments rather than rendering them", () => {
    expect(splitLinkifiedBody("https://only.test")).toEqual([
      { text: "https://only.test", href: "https://only.test" },
    ]);
  });
});

describe("isAllowedFeedImageType", () => {
  test("accepts the three the bucket allows and nothing else", () => {
    expect(isAllowedFeedImageType("image/jpeg")).toBe(true);
    expect(isAllowedFeedImageType("image/png")).toBe(true);
    expect(isAllowedFeedImageType("image/webp")).toBe(true);
    // What iOS hands back for a photo taken on-device.
    expect(isAllowedFeedImageType("image/heic")).toBe(false);
    expect(isAllowedFeedImageType(undefined)).toBe(false);
  });
});
