import {
  DEFAULT_LANGUAGE,
  getTranslator,
  isLanguage,
  resolveLanguage,
  type Translator,
} from "@lp/ui";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";

import { getApiClient } from "./api-client";
import { useAuth } from "./auth-context";

// English by default, so a screen rendered on its own (every unit test)
// reads the English copy without a provider.
const I18nContext = createContext<Translator>(getTranslator(DEFAULT_LANGUAGE));

/** The device's own language, through Hermes' Intl (no native module). */
function deviceLanguage() {
  try {
    return resolveLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Applies the saved `settings.language`, the same field the web reads.
 * Signed out (login, signup) there is no saved choice, so the device's
 * language decides. Like the theme, it follows the shared `me` query, so
 * saving on the Languages screen (which writes the cache) switches at once.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
    enabled: !!session,
  });
  const saved = data?.settings.language;
  const language = session && isLanguage(saved) ? saved : deviceLanguage();

  const value = useMemo(() => getTranslator(language), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const { t } = useI18n();` -- the translator for the current language. */
export function useI18n(): Translator {
  return useContext(I18nContext);
}
