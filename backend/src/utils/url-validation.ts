/**
 * SSRF protection: validate that a URL is safe for server-side fetching.
 *
 * Blocks:
 *  - Non-HTTP(S) schemes (file://, ftp://, gopher://, etc.)
 *  - Private/reserved IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x, etc.)
 *  - Link-local, loopback, and metadata service addresses (169.254.169.254)
 *  - localhost and common internal hostnames
 */

/** IPv4 ranges that must never be reached via server-side fetch */
const BLOCKED_IPV4_RANGES: Array<{ prefix: number; mask: number; label: string }> = [
  { prefix: 0x7f000000, mask: 0xff000000, label: '127.0.0.0/8 (loopback)' },
  { prefix: 0x0a000000, mask: 0xff000000, label: '10.0.0.0/8 (private)' },
  { prefix: 0xac100000, mask: 0xfff00000, label: '172.16.0.0/12 (private)' },
  { prefix: 0xc0a80000, mask: 0xffff0000, label: '192.168.0.0/16 (private)' },
  { prefix: 0xa9fe0000, mask: 0xffff0000, label: '169.254.0.0/16 (link-local)' },
  { prefix: 0x00000000, mask: 0xff000000, label: '0.0.0.0/8 (current network)' },
  { prefix: 0xc0000000, mask: 0xfffffff8, label: '192.0.0.0/29 (IETF protocol)' },
  { prefix: 0xc6336400, mask: 0xffffff00, label: '198.51.100.0/24 (documentation)' },
  { prefix: 0xcb007100, mask: 0xffffff00, label: '203.0.113.0/24 (documentation)' },
  { prefix: 0xc0000200, mask: 0xffffff00, label: '192.0.2.0/24 (documentation)' },
];

/**
 * Convert a dotted-quad IPv4 string to a 32-bit unsigned integer.
 * Returns null for anything that isn't a valid IPv4 address.
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255 || part !== String(num)) return null;
    result = (result << 8) | num;
  }
  return result >>> 0; // unsigned
}

/**
 * Check whether an IPv4 address falls within any blocked range.
 */
function isBlockedIPv4(ip: string): string | null {
  const num = ipv4ToInt(ip);
  if (num === null) return null; // not an IPv4 literal — caller handles hostname

  for (const range of BLOCKED_IPV4_RANGES) {
    if ((num & range.mask) === range.prefix) {
      return range.label;
    }
  }
  return null;
}

/** Hostnames that resolve to internal services */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;

  // Block any .internal, .local, .localhost TLDs
  if (
    lower.endsWith('.internal') ||
    lower.endsWith('.local') ||
    lower.endsWith('.localhost')
  ) {
    return true;
  }

  return false;
}

/**
 * Check if an IPv6 address is a loopback or private address.
 */
function isBlockedIPv6(hostname: string): boolean {
  // Strip brackets from IPv6 literals
  const ip = hostname.replace(/^\[|\]$/g, '');

  // Loopback
  if (ip === '::1' || ip === '::') return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) {
    return isBlockedIPv4(v4Mapped[1]) !== null;
  }

  // Unique local (fc00::/7)
  if (/^f[cd]/i.test(ip)) return true;

  // Link-local (fe80::/10)
  if (/^fe[89ab]/i.test(ip)) return true;

  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a URL for safe server-side fetching (SSRF protection).
 *
 * @param urlString The URL to validate
 * @returns Validation result with error message if invalid
 */
export function validateFetchUrl(urlString: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTP and HTTPS schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Scheme "${parsed.protocol}" is not allowed; only http: and https: are permitted` };
  }

  const hostname = parsed.hostname;

  // Block empty hostname
  if (!hostname) {
    return { valid: false, error: 'URL must have a hostname' };
  }

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    return { valid: false, error: `Hostname "${hostname}" is not allowed (internal/reserved)` };
  }

  // Check IPv4 literal
  const blockedRange = isBlockedIPv4(hostname);
  if (blockedRange) {
    return { valid: false, error: `IP address is in a blocked range: ${blockedRange}` };
  }

  // Check IPv6 literal
  if (hostname.startsWith('[') || hostname.includes(':')) {
    if (isBlockedIPv6(hostname)) {
      return { valid: false, error: 'IPv6 address is in a blocked range (loopback/private/link-local)' };
    }
  }

  // Block credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URL must not contain embedded credentials' };
  }

  return { valid: true };
}
