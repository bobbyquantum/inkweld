/**
 * Whether `value` can be one segment of a storage path or key. Usernames,
 * project slugs and slot keys are joined into paths on disk and keys in R2
 * (`<username>/<slug>/<file>`, `avatars/<username>.png`, …), so a segment may
 * not be empty or contain a separator (`/`, `\`), `..` or NUL. Both storage
 * adapters apply this one rule.
 */
export function isStorageSegment(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('..') &&
    !value.includes('\0')
  );
}
