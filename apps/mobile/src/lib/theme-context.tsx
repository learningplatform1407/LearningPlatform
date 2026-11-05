import { darkColors, figtreeFamily, lightColors } from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { StyleSheet, useColorScheme } from "react-native";

import { getApiClient } from "./api-client";
import { useAuth } from "./auth-context";

export type ThemeColors = { [K in keyof typeof lightColors]: string };
export type ThemePreference = "light" | "dark" | "system";

interface ThemeValue {
  colors: ThemeColors;
  scheme: "light" | "dark";
  preference: ThemePreference;
}

const LIGHT: ThemeValue = { colors: lightColors, scheme: "light", preference: "system" };

const ThemeContext = createContext<ThemeValue>(LIGHT);

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Applies the saved `settings.theme` (design.md §13), the same field the
 * web reads: "system" follows the device. Signed out there is no saved
 * preference, so the device decides. The `me` query is shared with every
 * screen that reads it, so saving on the Appearance screen (which writes
 * the cache) re-themes the app at once.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const device = useColorScheme();
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
    enabled: !!session,
  });
  const saved = data?.settings.theme;
  const preference: ThemePreference = session && isPreference(saved) ? saved : "system";
  const scheme = preference === "system" ? (device === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeValue>(
    () => ({ colors: scheme === "dark" ? darkColors : lightColors, scheme, preference }),
    [scheme, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

// StyleSheet.create's own parameter type. Constraining the factory's result
// to it keeps literal values ("row", "center") typed as style unions instead
// of widening them to string.
type StyleMap = Parameters<typeof StyleSheet.create>[0];

/** Figtree ships one family per weight, so a weight is chosen by family
 * name; `fontWeight` is dropped once the family carries it, because Android
 * would otherwise try to synthesise a bolder face on top. Body text is
 * weight 500, as on the web. */
function withFigtree<T>(styles: T): T {
  const out = {} as Record<string, object>;
  for (const [name, style] of Object.entries(styles as object) as [
    string,
    Record<string, unknown>,
  ][]) {
    if (("fontSize" in style || "fontWeight" in style) && !("fontFamily" in style)) {
      const weight = (style.fontWeight as keyof typeof figtreeFamily | undefined) ?? "500";
      const { fontWeight: _weight, ...rest } = style;
      out[name] = { ...rest, fontFamily: figtreeFamily[weight] ?? figtreeFamily["500"] };
    } else {
      out[name] = style;
    }
  }
  return out as T;
}

/**
 * A screen's styles, built from the active theme's colours. Replaces a
 * module-level `StyleSheet.create`, whose colours would be fixed at import
 * time and never follow a theme change:
 *
 *   const useStyles = makeStyles((colors) => ({ title: { color: colors.foreground } }));
 *   function Screen() { const styles = useStyles(); ... }
 */
export function makeStyles<T extends StyleMap>(factory: (colors: ThemeColors) => T & StyleMap) {
  const cache = new WeakMap<ThemeColors, Readonly<T>>();
  return function useStyles(): Readonly<T> {
    const colors = useThemeColors();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(withFigtree(factory(colors) as T));
      cache.set(colors, styles);
    }
    return styles;
  };
}
