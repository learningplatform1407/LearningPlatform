import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth-context";
import { Providers } from "@/lib/providers";
import { useTheme } from "@/lib/theme-context";

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const { colors, scheme } = useTheme();
  // Edge-to-edge (Android 15+, every iPhone with a notch) draws under the
  // status bar; one top inset here keeps every screen clear of it, the way
  // the web keeps a page-coloured strip under the top inset (HARDEN-9).
  // Bottom insets belong to whatever sits at the bottom: the tab bar, the
  // review bar.
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return null;
  }

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background, paddingTop: insets.top },
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Figtree, one family per weight (design.md §1). Nothing renders until
  // it has loaded, so no screen ever paints in the fallback face first.
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    <Providers>
      <RootNavigator />
    </Providers>
  );
}
