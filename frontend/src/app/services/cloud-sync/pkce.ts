/**
 * PKCE (RFC 7636) helpers for browser OAuth flows.
 *
 * Cloud Sync talks to providers directly from the browser, so there is no
 * client secret. PKCE binds the authorization code to this browser session
 * via a one-time verifier, which is what makes a public client safe.
 */

const VERIFIER_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** Encode bytes as base64url without padding, per RFC 7636 appendix A */
export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a code verifier of the given length (43..128 characters).
 * Uses only the unreserved characters RFC 7636 allows.
 */
export function generateCodeVerifier(length = 64): string {
  const size = Math.min(128, Math.max(43, length));
  const random = new Uint8Array(size);
  crypto.getRandomValues(random);
  let out = '';
  for (const value of random) {
    out += VERIFIER_ALPHABET[value % VERIFIER_ALPHABET.length];
  }
  return out;
}

/** S256 code challenge: base64url(sha256(verifier)) */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

/** Random opaque state value for CSRF protection on the redirect */
export function generateState(): string {
  const random = new Uint8Array(24);
  crypto.getRandomValues(random);
  return base64UrlEncode(random);
}
