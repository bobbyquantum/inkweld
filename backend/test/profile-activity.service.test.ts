import { describe, it, expect } from 'bun:test';
import {
  computeStreaks,
  dayKeyInZone,
  daysOfYear,
  isValidTimeZone,
  type ActivityDay,
} from '../src/services/profile-activity.service';

const day = (d: string, words: number): ActivityDay => ({
  day: d,
  words,
  sessions: words > 0 ? 1 : 0,
});

describe('profile activity service helpers', () => {
  describe('isValidTimeZone', () => {
    it('accepts IANA zones and rejects junk', () => {
      expect(isValidTimeZone('Europe/London')).toBe(true);
      expect(isValidTimeZone('UTC')).toBe(true);
      expect(isValidTimeZone('Not/AZone')).toBe(false);
      expect(isValidTimeZone(undefined)).toBe(false);
      expect(isValidTimeZone('x'.repeat(65))).toBe(false);
    });
  });

  describe('dayKeyInZone', () => {
    it('buckets an instant into the local day of the zone', () => {
      // 23:30 UTC on Mar 14 is already Mar 15 in Tokyo, still Mar 14 in London.
      const ms = Date.UTC(2026, 2, 14, 23, 30);
      expect(dayKeyInZone(ms, 'UTC')).toBe('2026-03-14');
      expect(dayKeyInZone(ms, 'Asia/Tokyo')).toBe('2026-03-15');
      expect(dayKeyInZone(ms, 'America/Los_Angeles')).toBe('2026-03-14');
    });
  });

  describe('daysOfYear', () => {
    it('produces 365 days, or 366 in a leap year, in order', () => {
      const y2026 = daysOfYear(2026);
      expect(y2026).toHaveLength(365);
      expect(y2026[0]).toBe('2026-01-01');
      expect(y2026.at(-1)).toBe('2026-12-31');
      expect(daysOfYear(2028)).toHaveLength(366);
    });
  });

  describe('computeStreaks', () => {
    it('finds the longest run of consecutive active days', () => {
      const days = [
        day('2026-01-01', 10),
        day('2026-01-02', 10),
        day('2026-01-03', 0),
        day('2026-01-04', 10),
        day('2026-01-05', 10),
        day('2026-01-06', 10),
        day('2026-01-07', 0),
      ];
      expect(computeStreaks(days, '2026-01-07').longest).toBe(3);
    });

    it('counts the current streak back from today', () => {
      const days = [day('2026-01-05', 1), day('2026-01-06', 1), day('2026-01-07', 1)];
      expect(computeStreaks(days, '2026-01-07').current).toBe(3);
    });

    it('keeps the streak alive when today has no words yet', () => {
      const days = [day('2026-01-05', 1), day('2026-01-06', 1), day('2026-01-07', 0)];
      expect(computeStreaks(days, '2026-01-07').current).toBe(2);
    });

    it('is zero when neither today nor yesterday was active', () => {
      const days = [day('2026-01-01', 1), day('2026-01-06', 0), day('2026-01-07', 0)];
      expect(computeStreaks(days, '2026-01-07').current).toBe(0);
      expect(computeStreaks([], '2026-01-07')).toEqual({ longest: 0, current: 0 });
    });
  });
});
