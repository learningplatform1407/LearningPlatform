import { Stack } from "expo-router";

// One Stack for the whole Profile subtree, for the same reason as
// learn/_layout.tsx: without it the tab bar/drawer lists people and
// [userId] as top-level entries of their own.
export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
