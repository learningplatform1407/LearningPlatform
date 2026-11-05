const WIDTH_CLASSES = {
  // The design's reading column: lesson text, forms, single lists.
  reading: "max-w-[47.5rem]",
  // The design's wide column (`.wrap.wide`): grids, tables, admin lists.
  wide: "max-w-[57.5rem]",
} as const;

/**
 * The standard content wrapper for an ordinary page: a centred column on
 * the page colour, the way the design's `.wrap` sits in the middle of the
 * screen. Generous bottom padding so the last line never ends flush against
 * the window edge (or under a bottom notch).
 *
 * Not used by pages with their own full-bleed layout (the lesson reader,
 * the Notebook), which own the width themselves.
 */
export function PageMain({
  children,
  width = "wide",
  className = "",
}: {
  children: React.ReactNode;
  width?: keyof typeof WIDTH_CLASSES;
  className?: string;
}) {
  return (
    <main
      className={`mx-auto w-full px-md pt-md pb-3xl md:px-xl ${WIDTH_CLASSES[width]} ${className}`}
    >
      {children}
    </main>
  );
}
