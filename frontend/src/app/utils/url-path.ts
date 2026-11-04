/**
 * Encode `value` as one segment of a URL path.
 *
 * `encodeURIComponent` escapes everything that could end the segment or the
 * path (`/`, `\`, `?`, `#`, `%`, control characters), but URL parsing still
 * resolves the dot segments `.` and `..` (even percent-encoded), so those are
 * refused: this throws for them, and for a value that is not a string (values
 * read from project data are not type-checked at run time). The generated API
 * client encodes its path parameters with this too (`config/api.config.ts`).
 */
export function encodePathSegment(value: string): string {
  if (typeof value !== 'string' || value === '.' || value === '..') {
    throw new Error('Not a URL path segment');
  }
  return encodeURIComponent(value);
}
