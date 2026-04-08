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

  it('should return "just now" for dates less than 1 minute ago', () => {
    const date = new Date('2026-04-08T11:59:30Z');
    expect(formatRelativeDate(date.toISOString())).toBe('just now');
    expect(formatRelativeDate(date.getTime())).toBe('just now');
  });

  it('should return minutes ago for dates less than 1 hour ago', () => {
    const date = new Date('2026-04-08T11:45:00Z');
    expect(formatRelativeDate(date.toISOString())).toBe('15m ago');
  });

  it('should return hours ago for dates less than 1 day ago', () => {
    const date = new Date('2026-04-08T09:00:00Z');
    expect(formatRelativeDate(date.toISOString())).toBe('3h ago');
  });

  it('should return days ago for dates less than 7 days ago', () => {
    const date = new Date('2026-04-05T12:00:00Z');
    expect(formatRelativeDate(date.toISOString())).toBe('3d ago');
  });

  it('should return locale date string for dates older than 7 days', () => {
    const date = new Date('2026-03-01T12:00:00Z');
    expect(formatRelativeDate(date.toISOString())).toBe(
      date.toLocaleDateString()
    );
  });

  it('should accept a numeric timestamp', () => {
    const ts = new Date('2026-04-08T11:50:00Z').getTime();
    expect(formatRelativeDate(ts)).toBe('10m ago');
  });

  it('should return locale date string for invalid dates (NaN diff)', () => {
    // new Date('not-a-date') produces Invalid Date; toLocaleDateString returns 'Invalid Date'
    const result = formatRelativeDate('not-a-date');
    expect(result).toBe('Invalid Date');
  });
});
