import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeDate } from './date-format';

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "now" for dates less than 1 minute ago', () => {
    const date = new Date('2026-04-08T11:59:30Z');
    expect(formatRelativeDate(date.toISOString(), 'en')).toBe('now');
    expect(formatRelativeDate(date.getTime(), 'en')).toBe('now');
  });

  it('should return minutes ago for dates less than 1 hour ago', () => {
    const date = new Date('2026-04-08T11:45:00Z');
    expect(formatRelativeDate(date.toISOString(), 'en')).toBe('15m ago');
  });

  it('should return hours ago for dates less than 1 day ago', () => {
    const date = new Date('2026-04-08T09:00:00Z');
    expect(formatRelativeDate(date.toISOString(), 'en')).toBe('3h ago');
  });

  it('should return days ago for dates less than 7 days ago', () => {
    const date = new Date('2026-04-05T12:00:00Z');
    expect(formatRelativeDate(date.toISOString(), 'en')).toBe('3d ago');
  });

  it('should return locale date string for dates older than 7 days', () => {
    const date = new Date('2026-03-01T12:00:00Z');
    expect(formatRelativeDate(date.toISOString(), 'en')).toBe(
      date.toLocaleDateString('en')
    );
  });

  it('should say "yesterday" for a day ago', () => {
    const date = new Date('2026-04-07T10:00:00Z');
    expect(formatRelativeDate(date.toISOString(), 'en')).toBe('yesterday');
  });

  it('should use the given locale', () => {
    const date = new Date('2026-04-08T11:45:00Z');
    expect(formatRelativeDate(date.toISOString(), 'fr')).toBe(
      new Intl.RelativeTimeFormat('fr', { style: 'narrow' }).format(
        -15,
        'minute'
      )
    );
  });

  it('should accept a numeric timestamp', () => {
    const ts = new Date('2026-04-08T11:50:00Z').getTime();
    expect(formatRelativeDate(ts, 'en')).toBe('10m ago');
  });

  it('should return an empty string for an invalid date', () => {
    expect(formatRelativeDate('not-a-date', 'en')).toBe('');
  });
});
