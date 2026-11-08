// Kept out of i18n.tsx for the same reason theme-script.ts is: the root
// layout is a server component, and a plain value imported from a "use
// client" module arrives as a client reference, not the string.

/** Mirrors the user's saved `settings.language` so the server renders the
 * first paint in it -- and signed-out pages (login, signup) in the last
 * language used on this browser. The API stays the source of truth. */
export const LANGUAGE_COOKIE = "lp-language";
