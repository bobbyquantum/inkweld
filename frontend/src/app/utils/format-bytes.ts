/**
 * Format a byte count into a human-readable string (e.g. "1.5 MB").
 *
 * Trailing ".0" is stripped so whole units render as "1 KB" (not "1.0 KB"),
 * matching the project's established formatting convention.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${Number.parseFloat(value.toFixed(1))} ${units[i]}`;
}
