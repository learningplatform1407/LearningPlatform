/** A message that changes with a count. `few` is Romanian's 2–19 form
 * ("3 lecții"); `other` is everything else, including Romanian's 20+
 * ("20 de lecții") and English's plural. `Intl.PluralRules` picks the form. */
export interface Plural {
  readonly one: string;
  readonly few?: string;
  readonly other: string;
}

export function plural(forms: Plural): Plural {
  return forms;
}
