import { Stack } from "expo-router";

// Without this, Expo Router's Drawer/Tabs navigator at the (app) level
// treats a nested subfolder (e.g. `learn/library/`) as its own top-level
// route group instead of nesting it under the single "learn" entry — it
// leaked learn/[id], learn/library/index, and learn/library/[bookId]
// as separate items in the sidebar/tab bar.
// Wrapping the whole subtree in one explicit Stack here keeps it collapsed
// under "Learn", matching how the flat lectures/ folder used to behave.
//
// A lesson opened from the contents drawer (`toc=1`) appears in place, with
// the drawer already open on it, instead of sliding in: moving through a
// chapter should feel like turning a page, not leaving one.
export default function LearnLayout() {
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: (route.params as { toc?: string } | undefined)?.toc === "1" ? "none" : "default",
      })}
    />
  );
}
