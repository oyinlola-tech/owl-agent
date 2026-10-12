export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.round((time - now) / 60000);
  const absolute = Math.abs(minutes);
  const phrase = (value: number, unit: string) => (minutes >= 0 ? `in ${value} ${unit}` : `${value} ${unit} ago`);
  if (absolute < 1) return minutes >= 0 ? "in under a minute" : "just now";
  if (absolute < 60) return phrase(absolute, "min");
  if (absolute < 60 * 24) return phrase(Math.round(absolute / 60), absolute < 120 ? "hour" : "hours");
  const days = Math.round(absolute / (60 * 24));
  if (minutes < 0 && days === 1) return "yesterday";
  if (days < 7) return phrase(days, "days");
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatShortTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const seconds = Math.max(0, (Date.now() - time) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return "yesterday";
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const daysBetween = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (daysBetween === 0) return "Today";
  if (daysBetween === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function formatByteSize(count: number | null | undefined): string {
  if (count === null || count === undefined) return "new";
  if (count >= 1024) return `${(count / 1024).toFixed(1)} KB`;
  return `${count} B`;
}
