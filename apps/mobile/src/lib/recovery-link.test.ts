import { parseRecoveryLink } from "./recovery-link";

const SCHEME = "learningplatform://reset-password";

test("reads the implicit flow's tokens out of the fragment", () => {
  // What the *default* {{ .ConfirmationURL }} template produces, because
  // supabase.ts leaves flowType at its "implicit" default. Linking.parse
  // would not surface this -- it drops the fragment.
  const url = `${SCHEME}?flow=recovery#access_token=abc&refresh_token=ref&type=recovery`;
  expect(parseRecoveryLink(url)).toEqual({
    kind: "tokens",
    accessToken: "abc",
    refreshToken: "ref",
  });
});

test("reads a token hash out of the query", () => {
  // The custom {{ .TokenHash }} template, which needs custom SMTP.
  const url = `${SCHEME}?flow=recovery&token_hash=hash&type=recovery`;
  expect(parseRecoveryLink(url)).toEqual({ kind: "tokenHash", tokenHash: "hash" });
});

test("prefers tokens when a link somehow carries both", () => {
  const url = `${SCHEME}?flow=recovery&token_hash=hash#access_token=abc&refresh_token=ref`;
  expect(parseRecoveryLink(url)).toEqual({
    kind: "tokens",
    accessToken: "abc",
    refreshToken: "ref",
  });
});

test("ignores a link that is not a recovery", () => {
  // Without the type/flow gate, a magic-link or email-confirmation deep link
  // would be taken for a recovery and drop the reader on the set-a-password
  // screen holding a session they never asked to change.
  expect(parseRecoveryLink(`${SCHEME}#access_token=abc&refresh_token=ref`)).toBeNull();
  expect(
    parseRecoveryLink(`${SCHEME}?type=magiclink#access_token=abc&refresh_token=ref`),
  ).toBeNull();
  expect(parseRecoveryLink(`${SCHEME}?type=signup&token_hash=hash`)).toBeNull();
});

test("ignores a recovery link carrying nothing to redeem", () => {
  expect(parseRecoveryLink(`${SCHEME}?flow=recovery`)).toBeNull();
  // Half a token pair is not a session.
  expect(parseRecoveryLink(`${SCHEME}?flow=recovery#access_token=abc`)).toBeNull();
});

test("survives an Expo Go development URL and percent escapes", () => {
  // In Expo Go there is no custom scheme; Linking.createURL yields exp://…/--/…
  const url =
    "exp://192.168.1.211:8081/--/reset-password?flow=recovery#access_token=a%2Bb&refresh_token=ref";
  expect(parseRecoveryLink(url)).toEqual({
    kind: "tokens",
    accessToken: "a+b",
    refreshToken: "ref",
  });
});

test("does not throw on a malformed escape", () => {
  // decodeURIComponent raises on a stray %, and a deep-link handler must not.
  expect(parseRecoveryLink(`${SCHEME}?flow=recovery&token_hash=%E0%A4%A`)).toBeNull();
});
