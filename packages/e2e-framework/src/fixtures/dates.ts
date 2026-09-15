/**
 * Date helpers for tests. All dates are ISO strings (YYYY-MM-DD) in UTC, matching the application.
 * Tests use relative dates so they keep passing next month and next year.
 */

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function today(): string {
  return isoDate(new Date());
}

export function daysAgo(days: number): string {
  return addDays(today(), -days);
}

/** The Monday of the week that starts the given number of weeks from now. Always in the future. */
export function mondayWeeksAhead(weeks: number): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const daysUntilNextMonday = ((8 - dayOfWeek) % 7) + 7 * (weeks - 1) || 7;
  return addDays(isoDate(now), daysUntilNextMonday);
}
