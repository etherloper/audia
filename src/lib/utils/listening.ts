/** Listening-history helpers. Days are local calendar dates, "YYYY-MM-DD". */

/** A day counts towards a streak once you've listened for at least this long. */
export const STREAK_MIN_SECS = 60;

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** The last `n` days ending with `today`, oldest first. */
export function lastNDays(n: number, today: Date): Date[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/**
 * Current and longest streaks of consecutive listening days. The current streak
 * still counts if you haven't listened yet today but did yesterday.
 */
export function streaks(secondsByDay: Map<string, number>, today: Date): { current: number; longest: number } {
  const active = (d: Date) => (secondsByDay.get(dayKey(d)) ?? 0) >= STREAK_MIN_SECS;

  let current = 0;
  let cursor = active(today) ? today : addDays(today, -1);
  while (active(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const days = [...secondsByDay.entries()]
    .filter(([, secs]) => secs >= STREAK_MIN_SECS)
    .map(([day]) => day)
    .sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    const [y, m, d] = day.split("-").map(Number);
    run = prev !== null && dayKey(addDays(new Date(y, m - 1, d), -1)) === prev ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return { current, longest: Math.max(longest, current) };
}
