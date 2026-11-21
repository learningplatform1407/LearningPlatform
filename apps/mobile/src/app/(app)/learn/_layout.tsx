import { Stack } from "expo-router";

// Without this, Expo Router's Drawer/Tabs navigator at the (app) level
// treats a nested subfolder (e.g. `learn/library/`) as its own top-level
// route group instead of nesting it under the single "learn" entry — it
// leaked learn/[id], learn/library/index, and learn/library/[bookId]
// as separate items in the sidebar/tab bar.
// Wrapping the whole subtree in one explicit Stack here keeps it collapsed
// under "Learn", matching how the flat lectures/ folder used to behave.
//
// Every lesson slides in. A lesson opened from the contents drawer used to
// appear in place instead, so that the drawer -- which came along via
// `?toc=1` -- seemed to stay put; the drawer now closes behind the lesson it
// opens (learn/[id].tsx), and a screen that arrives with no animation under a
// drawer that is no longer there just looks like a jump cut.
export default function LearnLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
