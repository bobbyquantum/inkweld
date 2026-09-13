/**
 * Client IP resolution shared by the rate limiter and the audit/logging
 * call sites (MCP key usage, OAuth token issuance).
 *
 * Proxy headers are only trusted when something in front of this server is
 * known to set them; otherwise any client can forge `X-Forwarded-For` and
 * pick its own rate-limit bucket (defeating the per-IP login limit and
 * growing the store by one entry per forged address).
 *
 * Resolution order:
 *   1. Cloudflare Workers: `CF-Connecting-IP`. Cloudflare sets/overwrites it
 *      on every request, so it is trustworthy there — and ONLY there; on a
 *      self-hosted server a client can send it themselves.
 *   2. `TRUST_PROXY=true`: the operator has a reverse proxy (nginx, Caddy,
 *      Traefik, Cloudflare Tunnel…) that overwrites forwarding headers. Use
 *      the RIGHTMOST `X-Forwarded-For` entry — the one appended by the
 *      trusted hop — then `X-Real-IP`. Leftmost would still be forgeable.
 *   3. The socket peer address from the runtime (Bun `server.requestIP`,
 *      @hono/node-server's incoming socket).
 *   4. `undefined` — callers fall back to a shared bucket / null audit field.
 *
 * `TRUST_PROXY` is read with bracket notation at call time (never hoisted)
 * because `bun build --compile --minify` constant-folds dotted `process.env`
 * reads at build time, which would freeze the value into the binary.
 */

import type { Context } from 'hono';

/** Mirrors the runtime detection in config/env.ts. Evaluated per call so tests can stub it. */
function isCloudflareWorkers(): boolean {
  const g = globalThis as Record<string, unknown>;
  return g.caches !== undefined && g.WebSocketPair !== undefined;
}

function trustProxy(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  const value = process.env['TRUST_PROXY'];
  return value === 'true' || value === '1';
}

function lastForwardedFor(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const parts = header.split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i].trim();
    if (candidate) return candidate;
  }
  return undefined;
}

/** Socket peer address as exposed by the Bun and Node adapters. */
function socketAddress(c: Context): string | undefined {
  // Bun: `Bun.serve({ fetch })` passes the Server as Hono's env binding.
  const env = c.env as { requestIP?: (req: Request) => { address?: string } | null } | undefined;
  if (env && typeof env.requestIP === 'function') {
    try {
      const address = env.requestIP(c.req.raw)?.address;
      if (address) return address;
    } catch {
      // Not a live Bun server (e.g. app.request() in tests).
    }
  }
  // @hono/node-server exposes the IncomingMessage on env.incoming.
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  const remote = incoming?.socket?.remoteAddress;
  if (remote) return remote;
  return undefined;
}

/**
 * Best-effort client IP for the current request, or `undefined` when it
 * cannot be determined trustworthily.
 */
export function getClientIp(c: Context): string | undefined {
  if (isCloudflareWorkers()) {
    const cfIp = c.req.header('cf-connecting-ip')?.trim();
    if (cfIp) return cfIp;
  }

  if (trustProxy()) {
    const forwarded = lastForwardedFor(c.req.header('x-forwarded-for'));
    if (forwarded) return forwarded;
    const realIp = c.req.header('x-real-ip')?.trim();
    if (realIp) return realIp;
  }

  return socketAddress(c);
}
