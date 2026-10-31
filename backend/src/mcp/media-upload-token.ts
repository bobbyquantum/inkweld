/**
 * Tokens behind `create_media_upload` URLs.
 *
 * An agent's HTTP tool has no MCP session, so the URL itself must say who may
 * upload what. It names one file in one project for a few minutes. It is signed
 * with a key derived for this purpose alone, so it can never pass as a session
 * or OAuth token, and those can never pass as it.
 */
import { sign, verify } from 'hono/jwt';
import { mcpSigningSecret } from './mcp.auth';

const AUDIENCE = 'inkweld:mcp-media-upload';

export const MEDIA_UPLOAD_TOKEN_TTL_SECONDS = 15 * 60;

export interface MediaUploadClaims {
  /** The user the MCP session acts for. */
  userId: string;
  username: string;
  /** The OAuth session, so revoking it stops its URLs too. */
  sessionId: string;
  projectId: string;
  /** The project's owner and slug, which together locate its storage. */
  owner: string;
  slug: string;
  /** The one file this URL may create. */
  filename: string;
}

function signingKey(env: Record<string, unknown> | undefined): string {
  return `${mcpSigningSecret(env)}:${AUDIENCE}`;
}

export async function signMediaUploadToken(
  claims: MediaUploadClaims,
  env: Record<string, unknown> | undefined,
  now = Date.now()
): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(now / 1000);
  const expiry = issuedAt + MEDIA_UPLOAD_TOKEN_TTL_SECONDS;
  const token = await sign(
    { ...claims, aud: AUDIENCE, iat: issuedAt, exp: expiry },
    signingKey(env),
    'HS256'
  );
  return { token, expiresAt: new Date(expiry * 1000) };
}

/** The token's claims, or null when it is invalid or has expired. */
export async function verifyMediaUploadToken(
  token: string,
  env: Record<string, unknown> | undefined
): Promise<MediaUploadClaims | null> {
  try {
    const payload = await verify(token, signingKey(env), 'HS256');
    return payload.aud === AUDIENCE ? (payload as unknown as MediaUploadClaims) : null;
  } catch {
    return null;
  }
}
