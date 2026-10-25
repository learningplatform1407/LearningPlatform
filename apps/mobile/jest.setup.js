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
