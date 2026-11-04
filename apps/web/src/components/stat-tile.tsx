import { Card } from "@/components/card";

/**
 * One number-and-label tile for the Profile page's statistics section.
 * `emphasis` switches on the hero-trio treatment (larger number, primary
 * outline) used for the three stats the user asked for by name — streak,
 * lessons completed, exam average; every other stat renders as a plain
 * secondary tile.
 */
export function StatTile({
  label,
  value,
  sublabel,
  emphasis = false,
}: {
  label: string;
  value: string;
  sublabel?: string;
  emphasis?: boolean;
}) {
  return (
    <Card
      className={`flex flex-col gap-0.5 p-md ${emphasis ? "border-foreground/40 shadow-dot" : ""}`}
    >
      <span
        className={`leading-tight font-extrabold text-foreground tabular-nums ${emphasis ? "text-3xl" : "text-xl"}`}
      >
        {value}
      </span>
      <span className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </span>
      {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
    </Card>
  );
}
