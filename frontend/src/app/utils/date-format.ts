/**
 * Formats a date as a human-readable relative string (e.g. "just now", "5m ago", "3d ago").
 * Falls back to locale date string for dates older than 7 days.
 */
export function formatRelativeDate(date: string | number): string {
  try {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    // Less than 1 minute
    if (diff < 60_000) return 'just now';
    // Less than 1 hour
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    // Less than 1 day
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    // Less than 7 days
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;

    return d.toLocaleDateString();
  } catch {
    return '';
  }
}
