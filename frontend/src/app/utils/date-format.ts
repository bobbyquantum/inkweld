const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Formats a date relative to now ("now", "5m ago", "3d ago") in `locale`,
 * the app's active language. Dates a week old or more show as a date; an
 * unparseable date shows as an empty string.
 */
export function formatRelativeDate(
  date: string | number,
  locale?: string
): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '';

  const relative = new Intl.RelativeTimeFormat(locale, {
    style: 'narrow',
    numeric: 'auto',
  });
  if (diff < MINUTE) return relative.format(0, 'second');
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), 'hour');
  if (diff < WEEK) return relative.format(-Math.floor(diff / DAY), 'day');
  return d.toLocaleDateString(locale);
}
