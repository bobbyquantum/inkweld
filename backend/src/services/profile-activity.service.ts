/**
 * Builds the GitHub-style "contribution grid" data for a user's profile:
 * one entry per calendar day of a year with the words they wrote that day
 * (positive deltas only, summed across every project they touched).
 *
 * Days are bucketed in the *viewer's* timezone when one is supplied, so a
 * late-night session lands on the day the writer experienced rather than
 * the UTC day. Falls back to UTC for unknown/absent zones.
 */
import type { DatabaseInstance } from '../types/context';
import { writingSessionService } from './writing-session.service';

export interface ActivityDay {
  /** ISO date YYYY-MM-DD in the requested timezone. */
  day: string;
  words: number;
  sessions: number;
}

export interface ActivityYear {
  year: number;
  timeZone: string;
  days: ActivityDay[];
  totalWords: number;
  activeDays: number;
  longestStreak: number;
  /** Streak ending today (or yesterday, if today has no words yet). */
  currentStreak: number;
  /** Years from the first one with writing through today, newest first. Always includes `year`. */
  availableYears: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Is `tz` an IANA zone the runtime understands? */
export function isValidTimeZone(tz: string | undefined): tz is string {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Format an epoch-ms instant as YYYY-MM-DD in `timeZone`. */
export function dayKeyInZone(ms: number, timeZone: string): string {
  // en-CA gives ISO ordering (YYYY-MM-DD) without needing to reassemble parts.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/** Add `n` days to a YYYY-MM-DD key (pure calendar arithmetic, zone-free). */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Every YYYY-MM-DD in `year` — 365 or 366 entries. */
export function daysOfYear(year: number): string[] {
  const out: string[] = [];
  let day = `${year}-01-01`;
  while (day.startsWith(String(year))) {
    out.push(day);
    day = addDays(day, 1);
  }
  return out;
}

export function computeStreaks(
  days: ActivityDay[],
  today: string
): { longest: number; current: number } {
  let longest = 0;
  let run = 0;
  const active = new Set<string>();
  for (const d of days) {
    if (d.words > 0) {
      active.add(d.day);
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  // Current streak counts back from today, or from yesterday when today is
  // still empty so an unfinished day doesn't read as a broken streak.
  let cursor = active.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (active.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { longest, current };
}

class ProfileActivityService {
  async yearForUser(
    db: DatabaseInstance,
    userId: string,
    year: number,
    timeZone = 'UTC',
    now = Date.now()
  ): Promise<ActivityYear> {
    // Widen the query window by a day either side so zone offsets can't
    // drop sessions at the year boundary; the day-key filter trims it back.
    const fromMs = Date.UTC(year, 0, 1) - DAY_MS;
    const toMs = Date.UTC(year + 1, 0, 1) + DAY_MS;

    const [rows, range] = await Promise.all([
      writingSessionService.positiveSessionsForUserBetween(db, userId, fromMs, toMs),
      writingSessionService.firstPositiveSessionForUser(db, userId),
    ]);

    const buckets = new Map<string, { words: number; sessions: number }>();
    for (const r of rows) {
      const key = dayKeyInZone(r.sessionEnd, timeZone);
      if (!key.startsWith(String(year))) continue;
      const b = buckets.get(key) ?? { words: 0, sessions: 0 };
      b.words += r.wordsDelta;
      b.sessions += 1;
      buckets.set(key, b);
    }

    const days: ActivityDay[] = daysOfYear(year).map((day) => {
      const b = buckets.get(day);
      return { day, words: b?.words ?? 0, sessions: b?.sessions ?? 0 };
    });

    const totalWords = days.reduce((acc, d) => acc + d.words, 0);
    const activeDays = days.filter((d) => d.words > 0).length;
    const today = dayKeyInZone(now, timeZone);
    const streaks = computeStreaks(days, today);

    // Contiguous run from the first year with any writing up to today, so
    // the picker has no gaps; the requested year is always present.
    const currentYear = Number(today.slice(0, 4));
    const years = new Set<number>([year, currentYear]);
    if (range) {
      const first = Number(dayKeyInZone(range.firstMs, timeZone).slice(0, 4));
      for (let y = first; y <= currentYear; y++) years.add(y);
    }

    return {
      year,
      timeZone,
      days,
      totalWords,
      activeDays,
      longestStreak: streaks.longest,
      currentStreak: streaks.current,
      availableYears: Array.from(years).sort((a, b) => b - a),
    };
  }
}

export const profileActivityService = new ProfileActivityService();
