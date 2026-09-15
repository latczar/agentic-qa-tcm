const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD. Rejects 2026-02-30 and similar. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Inclusive count of Monday-to-Friday days between two ISO dates.
 * Weekends do not count. Bank holidays are deliberately out of scope for this test double.
 */
export function workingDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  if (end < start) return 0;
  const oneDay = 86_400_000;
  let days = 0;
  for (let t = start; t <= end; t += oneDay) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

const britishDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** 2026-10-05 becomes "5 Oct 2026". */
export function formatDate(iso: string): string {
  return britishDate.format(new Date(`${iso}T00:00:00Z`));
}
