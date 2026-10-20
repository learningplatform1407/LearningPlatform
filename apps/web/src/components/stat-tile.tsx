import { Card } from "@/components/card";

/**
 * One number-and-label tile for the Profile page's statistics section.
 * `emphasis` switches on the hero-trio treatment (larger number, primary
 * border) used for the three stats the user asked for by name — streak,
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
    <Card className={`flex flex-col gap-xs p-md ${emphasis ? "border-primary" : ""}`}>
      <span className={emphasis ? "text-2xl font-semibold" : "text-lg font-semibold"}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
    </Card>
  );
}
