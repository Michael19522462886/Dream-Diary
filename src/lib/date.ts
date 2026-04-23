export function toEntryDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function todayEntryDate(): string {
  return toEntryDate(new Date());
}

export function shiftEntryDate(entryDate: string, offset: number): string {
  const next = new Date(`${entryDate}T12:00:00`);
  next.setDate(next.getDate() + offset);
  return toEntryDate(next);
}

export function buildRecentDates(centerDate: string, radius = 4): string[] {
  return Array.from({ length: radius * 2 + 1 }, (_, index) =>
    shiftEntryDate(centerDate, index - radius),
  );
}

export function formatDiaryDate(entryDate: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${entryDate}T12:00:00`));
}

export function formatDiaryBadge(entryDate: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${entryDate}T12:00:00`));
}

export function isSameEntryDate(left: string, right: string): boolean {
  return left === right;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDiaryTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function trimExcerpt(text: string, maxLength = 100): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }

  return compact.length > maxLength
    ? `${compact.slice(0, maxLength).trimEnd()}...`
    : compact;
}
