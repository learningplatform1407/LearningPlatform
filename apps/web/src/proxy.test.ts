import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

import { RECOVERY_COOKIE, signRecoveryMarker } from "@/lib/recovery-cookie";

import { proxy } from "./proxy";

// Read lazily inside the signer, so setting it here is enough.
process.env.RECOVERY_MARKER_SECRET = "test-only-secret";

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn() }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

function signedIn() {
  updateSession.mockResolvedValue({ response: NextResponse.next(), user: { id: "u1" } });
}

function signedOut() {
  updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });
}

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(`http://localhost:3000${path}`));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

const marker = (userId: string) => signRecoveryMarker(userId);

/** Null for a pass-through, the path for a redirect. */
async function destination(path: string, cookies?: Record<string, string>) {
  const response = await proxy(request(path, cookies));
  const location = response.headers.get("location");
  return location === null ? null : new URL(location).pathname;
}

beforeEach(() => {
  updateSession.mockReset();
});

test("sends a signed-out reader to /login, and lets them reach /login and /signup", async () => {
  signedOut();
  expect(await destination("/learn")).toBe("/login");
  expect(await destination("/login")).toBeNull();
  expect(await destination("/signup")).toBeNull();
});

test("sends a signed-in reader off /login and /signup", async () => {
  signedIn();
  expect(await destination("/login")).toBe("/");
  expect(await destination("/signup")).toBe("/");
});

test("/auth/confirm runs whatever the session says", async () => {
  // It redeems the recovery token, so bouncing a signed-in reader off it
  // would silently discard the link they clicked in their inbox.
  signedIn();
  expect(await destination("/auth/confirm")).toBeNull();
  signedOut();
  expect(await destination("/auth/confirm")).toBeNull();
});

test("/forgot-password is reachable while signed in", async () => {
  // Who the "Reset it by email" link in settings/account is for: logged in,
  // but cannot remember the password.
  signedIn();
  expect(await destination("/forgot-password")).toBeNull();
  signedOut();
  expect(await destination("/forgot-password")).toBeNull();
});

test("/reset-password needs the recovery marker, not merely a session", async () => {
  // The whole point. That page sets a new password without asking for the
  // current one, so a session alone would make it a one-click takeover from
  // any unlocked browser — and would reduce the current-password check in
  // settings/account to decoration.
  signedIn();
  expect(await destination("/reset-password")).toBe("/settings/account");
  expect(
    await destination("/reset-password", { [RECOVERY_COOKIE]: await marker("u1") }),
  ).toBeNull();
});

test("a hand-written marker does not open /reset-password", async () => {
  // `httpOnly` stops page scripts *reading* a cookie, not a person at the
  // keyboard *writing* one: `document.cookie = "lp-recovery=1"` is two
  // seconds of work in devtools. The value has to be unforgeable, which is
  // why it is an HMAC rather than a flag.
  signedIn();
  for (const forged of ["1", "true", "u1.9999999999.deadbeef", "u1", ""]) {
    expect(await destination("/reset-password", { [RECOVERY_COOKIE]: forged })).toBe(
      "/settings/account",
    );
  }
});

test("a marker signed for another user does not open /reset-password", async () => {
  // The signature covers the id, so a genuine marker lifted from one account
  // is useless against another.
  signedIn();
  expect(
    await destination("/reset-password", { [RECOVERY_COOKIE]: await marker("someone-else") }),
  ).toBe("/settings/account");
});

test("an expired marker does not open /reset-password", async () => {
  // The expiry is inside the signature, so editing the cookie's own Max-Age
  // cannot revive it.
  signedIn();
  const stale = await signRecoveryMarker("u1", Math.floor(Date.now() / 1000) - 3600);
  expect(await destination("/reset-password", { [RECOVERY_COOKIE]: stale })).toBe(
    "/settings/account",
  );
});

test("the gate covers sub-paths of /reset-password", async () => {
  // An exact-match check would let a later /reset-password/done fall through
  // to the allow-by-default branch for signed-in readers.
  signedIn();
  expect(await destination("/reset-password/done")).toBe("/settings/account");
  // …without swallowing an unrelated sibling route.
  expect(await destination("/reset-password-elsewhere")).toBeNull();
});

test("/reset-password without a session goes to /login, marker or not", async () => {
  // A stale bookmark, or a cookie that outlived its session.
  signedOut();
  expect(await destination("/reset-password")).toBe("/login");
  expect(await destination("/reset-password", { [RECOVERY_COOKIE]: await marker("u1") })).toBe(
    "/login",
  );
});
