/**
 * A review interval in days, as short as the grade buttons need it
 * (design.md §11): "1d", "12d", "3mo", "1.5y". Months are 30 days and years
 * 365 -- this is a hint about scale, not a date.
 */
export function formatInterval(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  return `${years < 10 ? Number(years.toFixed(1)) : Math.round(years)}y`;
}

/** The same interval in words, for screen readers and toasts. */
export function describeInterval(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}
