/**
 * Crypto helpers for the MCP OAuth flow (random tokens, SHA-256, PKCE).
 * Uses only Web Crypto, so it runs on both Bun and Workers.
 */

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureRandom(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // Reject bytes at or above the largest multiple of chars.length so every
  // character is equally likely (a plain modulo would favour the first few).
  const limit = 256 - (256 % chars.length);
  let result = '';
  while (result.length < length) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(length - result.length));
    for (const byte of randomBytes) {
      if (byte < limit) {
        result += chars[byte % chars.length];
      }
    }
  }
  return result;
}

/**
 * Hash a string using SHA-256
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Base64URL encode (for PKCE)
 */
export function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Verify PKCE code_verifier against code_challenge
 */
export async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const computed = base64UrlEncode(digest);
  return computed === codeChallenge;
}
