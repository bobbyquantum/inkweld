/**
 * Schemes that run script, or show content an attacker controls, as this
 * app's origin when assigned to `location.href`. Angular sanitizes `[href]`
 * bindings, but not a URL code navigates to itself.
 */
const UNSAFE_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'file:',
  'about:',
  'filesystem:',
  'view-source:',
]);

/**
 * Whether code may send the browser to `value`: an absolute URL whose
 * scheme is neither script nor content. Native-app schemes (`claude://`)
 * are allowed, so OAuth redirects back to desktop clients keep working.
 */
export function isSafeNavigationUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return !UNSAFE_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
