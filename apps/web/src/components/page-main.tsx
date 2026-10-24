/**
 * The standard content wrapper for an ordinary page: centers content with a
 * max-width instead of letting it stretch edge-to-edge next to the sidebar
 * on wide screens. 64rem comfortably fits this app's widest ordinary
 * page content (the 56rem import/manage lists), with enough room that this
 * box itself isn't the thing hugging the left edge.
 *
 * This alone only centers the box -- most pages also cap their own content
 * narrower still (a 32-48rem form or card list), so that inner wrapper needs
 * its own `mx-auto` too, or it will just hug the left edge of this one.
 *
 * Not used by pages with their own full-bleed multi-pane layout (the Learn
 * hub, the lesson reader, the Notebook), which intentionally fill the width
 * themselves.
 */
export function PageMain({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <main className={`mx-auto w-full max-w-[64rem] p-xl ${className}`}>{children}</main>;
}
