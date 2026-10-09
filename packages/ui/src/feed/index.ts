/** Feed pieces both clients need, kept in one place.
 *
 * `@lp/ui` is the only package both apps import at runtime (mobile's
 * `lib/theme.ts` re-exports its tokens; web lists it in `transpilePackages`),
 * which makes it the available home. The linkifier is the reason this module
 * exists: `docs/architecture/feed.md` stakes the feature's link safety on
 * matching `https?://` and nothing else, and a guarantee implemented twice is
 * only as good as whoever remembers to edit both copies.
 */

export const FEED_IMAGES_BUCKET = "feed-images";

export const MAX_FEED_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_FEED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type FeedImageMimeType = (typeof ALLOWED_FEED_IMAGE_TYPES)[number];

export function isAllowedFeedImageType(value: string | undefined): value is FeedImageMimeType {
  return value !== undefined && (ALLOWED_FEED_IMAGE_TYPES as readonly string[]).includes(value);
}

export const FEED_CATEGORY_LABELS = {
  news: "News",
  media: "Media",
} as const;

/** Only an absolute http(s) run is a candidate. Deliberately narrow: the body
 * is free text, so a looser pattern is how `javascript:` ends up in an href
 * or handed to a browser. */
const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

/** Trailing punctuation that reads as sentence structure rather than part of
 * the address, so "see https://example.com." does not link the full stop. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

export interface BodySegment {
  text: string;
  /** Present only on a segment that should be rendered as a link. */
  href?: string;
}

/** Splits a post body into plain and linkable segments.
 *
 * Returns data rather than markup so each platform renders it its own way --
 * an `<a>` on web, a pressable `Text` handing the href to the in-app browser
 * on mobile -- while the decision about *what counts as a link* is made once.
 */
export function splitLinkifiedBody(body: string): BodySegment[] {
  return body
    .split(URL_PATTERN)
    .flatMap((part): BodySegment[] => {
      if (!/^https?:\/\//.test(part)) return [{ text: part }];

      const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? "";
      const href = part.slice(0, part.length - trailing.length);
      const segments: BodySegment[] = [{ text: href, href }];
      if (trailing) segments.push({ text: trailing });
      return segments;
    })
    .filter((segment) => segment.text.length > 0);
}
