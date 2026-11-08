"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_LANGUAGE,
  getTranslator,
  isLanguage,
  type Language,
  type Translator,
} from "@lp/ui";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { LANGUAGE_COOKIE } from "@/lib/language-cookie";

interface I18nContextValue extends Translator {
  /** Switches the interface at once and remembers it on this browser. Saving
   * it to the account is the Languages page's job. */
  setLanguage: (language: Language) => void;
}

// The default is English with a no-op setter, so a component rendered on
// its own (every unit test) reads the English copy without a provider.
const I18nContext = createContext<I18nContextValue>({
  ...getTranslator(DEFAULT_LANGUAGE),
  setLanguage: () => {},
});

export function I18nProvider({
  initialLanguage,
  children,
}: {
  /** What the root layout read from the cookie or Accept-Language. */
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = useState(initialLanguage);

  const setLanguage = useCallback((next: Language) => {
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    setLanguageState(next);
  }, []);

  const value = useMemo(
    () => ({ ...getTranslator(language), setLanguage }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const { t } = useI18n();` -- the translator for the current language. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/** Adopts the saved `settings.language` whenever the `me` query loads or
 * changes, including after the Languages page saves (which writes the query
 * cache). Mounted in the signed-in layout, next to ThemeSync. */
export function LanguageSync() {
  const { language, setLanguage } = useI18n();
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => getBrowserApiClient().getMe(),
  });
  const saved = data?.settings.language;

  useEffect(() => {
    if (isLanguage(saved) && saved !== language) setLanguage(saved);
    // Keyed on the saved value only: `language` changing on its own (never,
    // today) must not be undone here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, setLanguage]);

  return null;
}

/** A translated sentence with elements in it: `{official}` in the message
 * becomes `parts.official`. Keeps the markup out of the catalogue and the
 * word order in it, where a translation can move it. */
export function rich(text: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return text
    .split(/\{(\w+)\}/g)
    .map((piece, index) =>
      index % 2 === 1 ? <Fragment key={index}>{parts[piece] ?? `{${piece}}`}</Fragment> : piece,
    );
}
