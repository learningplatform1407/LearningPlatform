/** Limits the quiz filter UI has to respect.
 *
 * Mirrors `MAX_FILTER_TAGS` in services/api/app/questions/constants.py, which
 * the question query enforces with a 400. Kept in sync by eye rather than
 * over the wire -- the same arrangement ProgressBar's DONE_THRESHOLD has with
 * the server's completion threshold. The server stays the authority; this
 * exists so the picker can stop at the limit and say so, rather than letting
 * someone select a 21st tag and meet an error they cannot act on.
 */
export const MAX_FILTER_TAGS = 20;
