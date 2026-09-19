/** Intl.RelativeTimeFormat is the whole library, no date dep needed. */
export function ago(value: string) {
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ] as const;
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}
