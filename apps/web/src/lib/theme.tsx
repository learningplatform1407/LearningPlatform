"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { THEME_COOKIE, THEME_COOKIE_PATTERN } from "@/lib/theme-script";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

// The cookie is the store. Reading it through useSyncExternalStore (rather
// than a useState initializer) gives the server render and hydration the
// same "system" snapshot, then switches to the real value with no
// hydration mismatch for anything that renders from the theme.
const listeners = new Set<() => void>();

function readCookie(): ThemePreference {
  const match = document.cookie.match(new RegExp(THEME_COOKIE_PATTERN));
  return (match?.[1] as ThemePreference | undefined) ?? "system";
}

function subscribeToCookie(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } else {
    root.setAttribute("data-theme", preference);
    document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=31536000; SameSite=Lax`;
  }
  for (const listener of listeners) listener();
}

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystem(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** Applies immediately. `persist` also saves it to the user's settings. */
  setPreference: (preference: ThemePreference, options?: { persist?: boolean }) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const preference = useSyncExternalStore(subscribeToCookie, readCookie, () => "system" as const);
  const systemDark = useSyncExternalStore(
    subscribeToSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );

  // Strict Mode's dev remount resets <html> to its JSX attributes, wiping the
  // one the inline script set. A no-op in production.
  useLayoutEffect(() => {
    apply(readCookie());
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference, options?: { persist?: boolean }) => {
      apply(next);
      if (options?.persist) {
        void getBrowserApiClient()
          .updateMe({ theme: next })
          .then((updated) => queryClient.setQueryData(["me"], updated));
      }
    },
    [queryClient],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved: preference === "system" ? (systemDark ? "dark" : "light") : preference,
      setPreference,
    }),
    [preference, systemDark, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

/** Adopts the saved `settings.theme` whenever the `me` query loads or
 * changes -- including after the Appearance page saves, which writes the
 * query cache. Mounted only in the signed-in layout: auth pages have no
 * `me` to ask for. */
export function ThemeSync() {
  const { setPreference } = useTheme();
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });
  const saved = data?.settings.theme;

  useEffect(() => {
    // Keyed on the saved value only, so a local toggle that's still saving
    // isn't reverted mid-flight; once the save lands, `saved` equals it.
    if (isPreference(saved) && saved !== readCookie()) setPreference(saved);
  }, [saved, setPreference]);

  return null;
}
