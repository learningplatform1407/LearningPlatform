// Expo CLI commands (start/lint/export) load .env automatically; Jest does
// not. Tests never need real Supabase credentials — set safe placeholders
// so importing modules that construct the Supabase client doesn't throw.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.EXPO_PUBLIC_API_URL ??= "http://localhost:8000";

// The native module backing AsyncStorage isn't available in the Jest
// environment; the package ships an official in-memory mock for tests.
// async-storage 2.x (the version SDK 58 pins) has no "exports" map, so the
// mock has to be required by its real path rather than a "./jest" subpath.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// react-native-pdf (and its native-code dependency react-native-blob-util)
// have no Jest-compatible build -- requiring the real module throws
// ("the native module is not available") the instant anything imports it.
// Stub it with a plain View so pdf-lesson-view.tsx can be imported under
// Jest; no test renders real PDF content through it, only the surrounding
// toggle/mode-switching logic.
jest.mock("react-native-pdf", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockPdf = React.forwardRef((props, ref) =>
    React.createElement(View, { ...props, ref, testID: "mock-pdf" }),
  );
  MockPdf.displayName = "Pdf";
  return { __esModule: true, default: MockPdf };
});
