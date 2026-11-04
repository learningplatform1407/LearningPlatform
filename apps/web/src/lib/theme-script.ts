// Kept out of theme.tsx: that module is "use client", and a server
// component (the root layout) importing a plain value from a client module
// receives a client reference, not the string.

/** Mirrors the user's saved `settings.theme` so the inline script in the
 * root layout can apply it before first paint, without the server having to
 * read cookies (which would make every page dynamic). The API stays the
 * source of truth; this is a cache of it. */
export const THEME_COOKIE = "lp-theme";

export const THEME_COOKIE_PATTERN = `(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)`;

/** Runs in <head> during HTML parsing. "system" sets no attribute, letting
 * the prefers-color-scheme rules in globals.css decide. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/${THEME_COOKIE_PATTERN}/);if(m)document.documentElement.setAttribute("data-theme",m[1])}catch(e){}})()`;
