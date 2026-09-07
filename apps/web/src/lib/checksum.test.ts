// @vitest-environment node
//
// jsdom's File polyfill (the default environment for this project) doesn't
// implement arrayBuffer()/text() at all — real browsers do (per spec), and so
// does Node's own File/Blob, so this file runs under Node's environment
// specifically to exercise the real implementation.
import { expect, test } from "vitest";

import { sha256Hex } from "./checksum";

test("hashes file contents to the expected sha256 hex digest", async () => {
  const file = new File(["hello world"], "test.txt", { type: "text/plain" });

  // Known sha256("hello world") digest, cross-checked with Node's crypto module.
  await expect(sha256Hex(file)).resolves.toBe(
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );
});

test("produces different digests for different content", async () => {
  const a = await sha256Hex(new File(["a"], "a.txt"));
  const b = await sha256Hex(new File(["b"], "b.txt"));
  expect(a).not.toBe(b);
});
