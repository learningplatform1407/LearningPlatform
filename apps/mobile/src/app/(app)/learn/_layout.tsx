import { Stack } from "expo-router";

// Without this, Expo Router's Drawer/Tabs navigator at the (app) level
// treats the nested `learn/lessons/` subfolder as its own top-level route
// group instead of nesting it under the single "learn" entry — it leaked
// learn/[id], learn/flashcards, learn/lessons/index, and
// learn/lessons/[chapterId] as separate items in the sidebar/tab bar.
// Wrapping the whole subtree in one explicit Stack here keeps it collapsed
// under "Learn", matching how the flat lectures/ folder used to behave.
export default function LearnLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
