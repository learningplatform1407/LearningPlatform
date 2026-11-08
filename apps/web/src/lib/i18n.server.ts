import { getTranslator, isLanguage, resolveLanguage, type Translator } from "@lp/ui";
import { cookies, headers } from "next/headers";

import { LANGUAGE_COOKIE } from "@/lib/language-cookie";

/** The reader's translator inside a server component or server action: the
 * saved choice the cookie mirrors, else the browser's Accept-Language --
 * the same rule the root layout renders with. */
export async function getServerTranslator(): Promise<Translator> {
  const saved = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  if (isLanguage(saved)) return getTranslator(saved);
  return getTranslator(resolveLanguage((await headers()).get("accept-language")));
}
