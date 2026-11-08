import { LOCALE_TAGS, type Language } from "./languages";
import type { Plural } from "./plural";
import { en, type Messages } from "./messages/en";
import { ro } from "./messages/ro";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Plural
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every translatable string, as a dotted path: `"lesson.tabs.review"`. */
export type MessageKey = Leaves<Messages>;

export type MessageParams = Record<string, string | number>;

export interface Translator {
  language: Language;
  /** The `Intl` locale tag for this language. */
  locale: string;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const CATALOGUES: Record<Language, Messages> = { en, ro };

function lookup(messages: Messages, key: string): string | Plural | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node as string | Plural | undefined;
}

function create(language: Language): Translator {
  const locale = LOCALE_TAGS[language];
  const rules = new Intl.PluralRules(locale);
  const numbers = new Intl.NumberFormat(locale);

  function t(key: MessageKey, params?: MessageParams): string {
    // A key missing from a catalogue is a type error, so the English
    // fallback only ever covers a malformed key at runtime.
    const entry = lookup(CATALOGUES[language], key) ?? lookup(en, key) ?? key;
    let text: string;
    if (typeof entry === "string") {
      text = entry;
    } else {
      const count = typeof params?.count === "number" ? params.count : 0;
      const form = rules.select(count);
      text = (form === "one" ? entry.one : form === "few" ? entry.few : undefined) ?? entry.other;
    }
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      if (value === undefined) return match;
      return typeof value === "number" ? numbers.format(value) : value;
    });
  }

  return { language, locale, t };
}

const translators = new Map<Language, Translator>();

/** One shared translator per language; cheap to call on every render. */
export function getTranslator(language: Language): Translator {
  let translator = translators.get(language);
  if (!translator) {
    translator = create(language);
    translators.set(language, translator);
  }
  return translator;
}

/** A Supabase auth error in the reader's language when its code is one the
 * catalogues know, else Supabase's own (English) message. */
export function authErrorMessage(
  translator: Translator,
  error: { code?: string; message: string },
): string {
  const codes = Object.keys(en.auth.errors);
  if (error.code && codes.includes(error.code)) {
    return translator.t(`auth.errors.${error.code}` as MessageKey);
  }
  return error.message;
}
