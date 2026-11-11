/** A learner's round avatar: their picture, else the first letter of
 * whatever names them. Decorative -- the name is always rendered next to it. */
export function UserAvatar({
  url,
  name,
  size = "md",
}: {
  url: string | null;
  name: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const box = { sm: "h-9 w-9 text-sm", md: "h-12 w-12 text-base", lg: "h-16 w-16 text-lg" }[size];
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-medium text-muted-foreground ${box}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not worth next/image config for a thumbnail
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{(name ?? "?").slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
