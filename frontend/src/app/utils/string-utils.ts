/**
 * Strip trailing slash characters from a string.
 * Non-regex implementation to avoid SonarCloud S5852 (ReDoS) false positives.
 */
export function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return end < s.length ? s.substring(0, end) : s;
}

/**
 * Trim leading and trailing hyphens from a string.
 * Non-regex implementation to avoid SonarCloud S5852 false positives on `/^-+|-+$/g`.
 */
export function trimHyphens(s: string): string {
  let start = 0,
    end = s.length;
  while (start < end && s[start] === '-') start++;
  while (end > start && s[end - 1] === '-') end--;
  return s.substring(start, end);
}

/**
 * Normalize a server URL typed by a user: trims it, drops trailing slashes and
 * adds a protocol when missing (http for localhost / 127.0.0.1, https for
 * everything else).
 */
export function normalizeServerUrl(url: string): string {
  const trimmed = stripTrailingSlashes(url.trim());
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}
