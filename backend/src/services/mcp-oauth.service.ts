/**
 * MCP OAuth 2.1 Service
 *
 * Implements OAuth 2.1 authorization for MCP clients with:
 * - Dynamic Client Registration (RFC 7591)
 * - PKCE (RFC 7636) - mandatory
 * - JWT access tokens with permission snapshots
 * - Refresh token rotation
 *
 * This service handles all OAuth operations and integrates with the
 * project collaborators system for permission management.
 */

import { eq, and, not, isNull, or, lt } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import type { DatabaseInstance } from '../types/context';
import {
  mcpOAuthClients,
  type McpOAuthClient,
  type InsertMcpOAuthClient,
  type PublicOAuthClient,
} from '../db/schema/mcp-oauth-clients';
import {
  mcpOAuthSessions,
  type InsertMcpOAuthSession,
  type PublicOAuthSession,
} from '../db/schema/mcp-oauth-sessions';
import {
  mcpOAuthCodes,
  type InsertMcpOAuthCode,
  type OAuthCodeGrant,
} from '../db/schema/mcp-oauth-codes';
import {
  projectCollaborators,
  roleToMcpPermissions,
  type CollaboratorRole,
} from '../db/schema/project-collaborators';
import { projects } from '../db/schema/projects';
import { users } from '../db/schema/users';
import { logger } from './logger.service';
import { config } from '../config/env';

const oauthLog = logger.child('OAuth');

// Token configuration
const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const AUTH_CODE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const PREV_TOKEN_GRACE_PERIOD = 60 * 1000; // 1 minute grace period for token rotation

/**
 * Generate a cryptographically secure random string
 */
function generateSecureRandom(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes)
    .map((byte) => chars[byte % chars.length])
    .join('');
}

/**
 * Hash a string using SHA-256
 */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Base64URL encode (for PKCE)
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify PKCE code_verifier against code_challenge
 */
async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const computed = base64UrlEncode(digest);
  return computed === codeChallenge;
}

/**
 * JWT payload for MCP access tokens
 */
export interface McpAccessTokenPayload {
  /** Issuer */
  iss: string;
  /** Subject (user ID) */
  sub: string;
  /** Audience (MCP server URI) */
  aud: string;
  /** Expiration time */
  exp: number;
  /** Issued at */
  iat: number;
  /** JWT ID (unique token identifier) */
  jti: string;
  /** OAuth session ID */
  session_id: string;
  /** Client ID */
  client_id: string;
  /** Username */
  username: string;
  /** Project grants with permissions */
  grants: Array<{
    /** Project ID */
    p: string;
    /** Project slug */
    s: string;
    /** Owner username */
    o: string;
    /** Permissions array */
    r: string[];
  }>;
}

/**
 * Result of token generation
 */
export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  scope?: string;
}

/**
 * Result of client registration
 * Note: Optional URI fields are only included if they were provided in the request.
 * Returning null/empty strings for these fields can cause Claude's Zod validation to fail.
 */
export interface ClientRegistrationResult {
  clientId: string;
  clientSecret?: string;
  clientSecretExpiresAt: number;
  clientName: string;
  redirectUris: string[];
  // Only included if provided in registration request (avoid empty strings/nulls)
  clientUri?: string;
  logoUri?: string;
  policyUri?: string;
  tosUri?: string;
  tokenEndpointAuthMethod: 'none' | 'client_secret_basic' | 'client_secret_post';
}

/**
 * Authorization request parameters
 */
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope?: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

/**
 * Parsed and validated authorization request
 */
export interface ValidatedAuthRequest extends AuthorizationRequest {
  client: McpOAuthClient;
}

/**
 * Environment bindings type for Cloudflare Workers
 */
export interface CloudflareEnv {
  DATABASE_KEY?: string;
  SESSION_SECRET?: string;
  [key: string]: unknown;
}

/**
 * MCP OAuth Service
 */
class McpOAuthService {
  /**
   * Get JWT signing secret from Cloudflare env bindings or config
   *
   * On Cloudflare Workers, secrets are only available via c.env bindings,
   * not process.env. The env parameter must be passed from route handlers.
   *
   * @param env - Optional Cloudflare env bindings (required on Workers)
   */
  private getSecret(env?: CloudflareEnv): string {
    // Try Cloudflare env bindings first (Workers runtime)
    if (env) {
      const envSecret = env.DATABASE_KEY || env.SESSION_SECRET;
      if (envSecret && typeof envSecret === 'string' && envSecret.length >= 32) {
        return envSecret;
      }
    }

    // Fall back to config (Bun/Node.js with process.env)
    const secret = config.databaseKey;
    if (!secret || secret.length < 32) {
      throw new Error('DATABASE_KEY must be at least 32 characters for JWT signing');
    }
    return secret;
  }

  // Note: issuer URL is passed as parameter from route handlers
  // to support Cloudflare Workers where process.env doesn't work

  // ============================================
  // Client Management (DCR)
  // ============================================

  /**
   * Register a new OAuth client (Dynamic Client Registration)
   */
  async registerClient(
    db: DatabaseInstance,
    data: {
      clientName: string;
      redirectUris: string[];
      clientUri?: string;
      logoUri?: string;
      contactEmail?: string;
      policyUri?: string;
      tosUri?: string;
      clientType?: 'public' | 'confidential';
    }
  ): Promise<ClientRegistrationResult> {
    const clientId = crypto.randomUUID();
    const isConfidential = data.clientType === 'confidential';

    let clientSecretHash: string | null = null;
    let clientSecretPrefix: string | null = null;
    let clientSecret: string | undefined;

    if (isConfidential) {
      clientSecret = `iw_cs_${generateSecureRandom(32)}`;
      clientSecretHash = await hashString(clientSecret);
      clientSecretPrefix = clientSecret.substring(0, 10);
    }

    const clientData: InsertMcpOAuthClient = {
      id: clientId,
      clientName: data.clientName,
      redirectUris: JSON.stringify(data.redirectUris),
      clientUri: data.clientUri ?? null,
      logoUri: data.logoUri ?? null,
      contactEmail: data.contactEmail ?? null,
      policyUri: data.policyUri ?? null,
      tosUri: data.tosUri ?? null,
      clientType: data.clientType ?? 'public',
      clientSecretHash,
      clientSecretPrefix,
      isDynamic: true,
      createdAt: Date.now(),
    };

    await db.insert(mcpOAuthClients).values(clientData);

    oauthLog.info(`Registered OAuth client: ${data.clientName} (${clientId})`);

    // Build response - only include optional URI fields if they were provided
    // Returning null/empty strings can cause Claude's Zod validation to fail
    const result: ClientRegistrationResult = {
      clientId,
      clientSecret,
      clientSecretExpiresAt: 0, // Never expires
      clientName: data.clientName,
      redirectUris: data.redirectUris,
      tokenEndpointAuthMethod: isConfidential ? 'client_secret_basic' : 'none',
    };

    // Only include URIs if they were actually provided (not empty/null)
    if (data.clientUri) result.clientUri = data.clientUri;
    if (data.logoUri) result.logoUri = data.logoUri;
    if (data.policyUri) result.policyUri = data.policyUri;
    if (data.tosUri) result.tosUri = data.tosUri;

    return result;
  }

  /**
   * Look up a client by ID
   */
  async lookupClient(db: DatabaseInstance, clientId: string): Promise<McpOAuthClient | null> {
    const [client] = await db
      .select()
      .from(mcpOAuthClients)
      .where(eq(mcpOAuthClients.id, clientId))
      .limit(1);

    return client ?? null;
  }

  /**
   * Get public client info (safe for consent UI)
   */
  async getPublicClient(db: DatabaseInstance, clientId: string): Promise<PublicOAuthClient | null> {
    const client = await this.lookupClient(db, clientId);
    if (!client) return null;

    return {
      id: client.id,
      clientName: client.clientName,
      clientUri: client.clientUri,
      logoUri: client.logoUri,
    };
  }

  /**
   * Validate client secret (for confidential clients)
   */
  async validateClientSecret(
    db: DatabaseInstance,
    clientId: string,
    clientSecret: string
  ): Promise<boolean> {
    const client = await this.lookupClient(db, clientId);
    if (!client || client.clientType !== 'confidential' || !client.clientSecretHash) {
      return false;
    }

    const secretHash = await hashString(clientSecret);
    return secretHash === client.clientSecretHash;
  }

  /**
   * Delete a client
   */
  async deleteClient(db: DatabaseInstance, clientId: string): Promise<void> {
    await db.delete(mcpOAuthClients).where(eq(mcpOAuthClients.id, clientId));
    oauthLog.info(`Deleted OAuth client: ${clientId}`);
  }

  // ============================================
  // Authorization Flow
  // ============================================

  /**
   * Parse and validate an authorization request
   */
  async parseAuthorizationRequest(
    db: DatabaseInstance,
    params: Record<string, string | undefined>
  ): Promise<ValidatedAuthRequest> {
    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = params;

    // Validate required parameters
    if (!client_id) {
      throw new OAuthError('invalid_request', 'client_id is required');
    }
    if (!redirect_uri) {
      throw new OAuthError('invalid_request', 'redirect_uri is required');
    }
    if (response_type !== 'code') {
      throw new OAuthError('unsupported_response_type', 'Only response_type=code is supported');
    }
    if (!code_challenge) {
      throw new OAuthError('invalid_request', 'code_challenge is required (PKCE mandatory)');
    }
    if (code_challenge_method !== 'S256') {
      throw new OAuthError('invalid_request', 'code_challenge_method must be S256');
    }

    // Look up client
    const client = await this.lookupClient(db, client_id);
    if (!client) {
      throw new OAuthError('invalid_client', 'Client not found');
    }

    // Validate redirect URI
    const allowedUris: string[] = JSON.parse(client.redirectUris);
    if (!allowedUris.includes(redirect_uri)) {
      throw new OAuthError('invalid_request', 'redirect_uri not registered for this client');
    }

    return {
      clientId: client_id,
      redirectUri: redirect_uri,
      responseType: response_type,
      scope: scope ?? undefined,
      state: state ?? undefined,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      client,
    };
  }

  /**
   * Create an authorization code after user consent
   */
  async createAuthorizationCode(
    db: DatabaseInstance,
    data: {
      userId: string;
      clientId: string;
      redirectUri: string;
      codeChallenge: string;
      codeChallengeMethod: string;
      grants: OAuthCodeGrant[];
      scope?: string;
      state?: string;
    }
  ): Promise<string> {
    // Generate authorization code
    const code = generateSecureRandom(48);
    const codeHash = await hashString(code);

    const now = Date.now();
    const codeData: InsertMcpOAuthCode = {
      codeHash,
      userId: data.userId,
      clientId: data.clientId,
      codeChallenge: data.codeChallenge,
      codeChallengeMethod: data.codeChallengeMethod,
      redirectUri: data.redirectUri,
      grants: JSON.stringify(data.grants),
      scope: data.scope ?? null,
      state: data.state ?? null,
      createdAt: now,
      expiresAt: now + AUTH_CODE_TTL,
    };

    await db.insert(mcpOAuthCodes).values(codeData);

    oauthLog.info(`Created authorization code for user ${data.userId}, client ${data.clientId}`);

    return code;
  }

  /**
   * Exchange authorization code for tokens
   *
   * @param db - Database instance
   * @param data - The exchange data
   * @param env - Optional Cloudflare env bindings (required on Workers)
   */
  async exchangeAuthorizationCode(
    db: DatabaseInstance,
    data: {
      code: string;
      codeVerifier: string;
      clientId: string;
      redirectUri: string;
      issuer: string;
      clientIp?: string;
      userAgent?: string;
    },
    env?: CloudflareEnv
  ): Promise<TokenResult> {
    const codeHash = await hashString(data.code);

    // Look up code
    const [authCode] = await db
      .select()
      .from(mcpOAuthCodes)
      .where(eq(mcpOAuthCodes.codeHash, codeHash))
      .limit(1);

    if (!authCode) {
      throw new OAuthError('invalid_grant', 'Authorization code not found');
    }

    // Check if already used
    if (authCode.usedAt) {
      throw new OAuthError('invalid_grant', 'Authorization code already used');
    }

    // Check if expired
    if (Date.now() > authCode.expiresAt) {
      throw new OAuthError('invalid_grant', 'Authorization code expired');
    }

    // Verify PKCE first - this is the primary security mechanism for public clients
    const pkceValid = await verifyPkce(data.codeVerifier, authCode.codeChallenge);
    if (!pkceValid) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed');
    }

    // Validate redirect URI (must match exactly)
    if (authCode.redirectUri !== data.redirectUri) {
      throw new OAuthError('invalid_grant', 'Redirect URI mismatch');
    }

    // Client ID validation - for public clients using PKCE, we can be lenient
    // since PKCE already proves the same party is completing the flow.
    // Some OAuth clients (e.g., Claude) register multiple dynamic clients
    // and may use a different one for token exchange due to race conditions.
    if (authCode.clientId !== data.clientId) {
      oauthLog.warn(
        `Client ID mismatch during token exchange: code was for ${authCode.clientId}, ` +
          `but request used ${data.clientId}. Allowing due to valid PKCE.`
      );
      // We continue with the ORIGINAL client ID from the auth code for session creation
    }

    // Mark code as used
    await db
      .update(mcpOAuthCodes)
      .set({ usedAt: Date.now() })
      .where(eq(mcpOAuthCodes.id, authCode.id));

    // Parse grants
    const grants: OAuthCodeGrant[] = JSON.parse(authCode.grants);

    // Get user info
    const [user] = await db.select().from(users).where(eq(users.id, authCode.userId)).limit(1);

    if (!user || !user.username) {
      throw new OAuthError('server_error', 'User not found');
    }

    // Create session and collaborator entries
    const session = await this.createSession(
      db,
      {
        userId: authCode.userId,
        clientId: authCode.clientId,
        grants,
        issuer: data.issuer,
        clientIp: data.clientIp,
        userAgent: data.userAgent,
      },
      env
    );

    oauthLog.info(
      `Exchanged authorization code for tokens: session ${session.sessionId}, user ${authCode.userId}`
    );

    return session.tokens;
  }

  // ============================================
  // Session & Token Management
  // ============================================

  /**
   * Create a new OAuth session with project grants
   *
   * @param db - Database instance
   * @param data - The session data
   * @param env - Optional Cloudflare env bindings (required on Workers)
   */
  async createSession(
    db: DatabaseInstance,
    data: {
      userId: string;
      clientId: string;
      grants: OAuthCodeGrant[];
      clientIp?: string;
      userAgent?: string;
      issuer: string;
    },
    env?: CloudflareEnv
  ): Promise<{ sessionId: string; tokens: TokenResult }> {
    const sessionId = crypto.randomUUID();
    const refreshToken = `iw_rt_${generateSecureRandom(48)}`;
    const refreshTokenHash = await hashString(refreshToken);
    const now = Date.now();

    // Create session
    const sessionData: InsertMcpOAuthSession = {
      id: sessionId,
      userId: data.userId,
      clientId: data.clientId,
      refreshTokenHash,
      createdAt: now,
      lastUsedAt: now,
      lastUsedIp: data.clientIp ?? null,
      lastUsedUserAgent: data.userAgent ?? null,
      expiresAt: now + REFRESH_TOKEN_TTL * 1000,
    };

    await db.insert(mcpOAuthSessions).values(sessionData);

    // Revoke any previous sessions for the same user+client combination.
    // This ensures that relinking an agent (e.g. after delink/relink) replaces
    // the old collaborator entries rather than creating duplicates.
    const existingSessions = await db
      .select()
      .from(mcpOAuthSessions)
      .where(
        and(
          eq(mcpOAuthSessions.userId, data.userId),
          eq(mcpOAuthSessions.clientId, data.clientId),
          not(eq(mcpOAuthSessions.id, sessionId)),
          isNull(mcpOAuthSessions.revokedAt)
        )
      );

    for (const existing of existingSessions) {
      await this.revokeSession(db, existing.id, 'Superseded by new session');
    }

    // Create collaborator entries for each granted project
    for (const grant of data.grants) {
      await db.insert(projectCollaborators).values({
        projectId: grant.projectId,
        userId: data.userId,
        mcpSessionId: sessionId,
        collaboratorType: 'oauth_app',
        role: grant.role,
        status: 'accepted',
        invitedBy: data.userId,
        invitedAt: now,
        acceptedAt: now,
      });
    }

    // Generate access token
    const tokens = await this.generateTokens(db, sessionId, refreshToken, data.issuer, env);

    return { sessionId, tokens };
  }

  /**
   * Refresh tokens using refresh token
   *
   * @param db - Database instance
   * @param refreshToken - The refresh token
   * @param issuer - The issuer URL
   * @param clientIp - Optional client IP
   * @param userAgent - Optional user agent
   * @param env - Optional Cloudflare env bindings (required on Workers)
   */
  async refreshTokens(
    db: DatabaseInstance,
    refreshToken: string,
    issuer: string,
    clientIp?: string,
    userAgent?: string,
    env?: CloudflareEnv
  ): Promise<TokenResult> {
    const refreshTokenHash = await hashString(refreshToken);
    const now = Date.now();

    // Look up session by current or previous token
    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(
        or(
          eq(mcpOAuthSessions.refreshTokenHash, refreshTokenHash),
          and(
            eq(mcpOAuthSessions.previousRefreshTokenHash, refreshTokenHash),
            // Previous token still in grace period
            or(
              isNull(mcpOAuthSessions.previousTokenExpiresAt),
              lt(mcpOAuthSessions.previousTokenExpiresAt, now + PREV_TOKEN_GRACE_PERIOD)
            )
          )
        )
      )
      .limit(1);

    if (!session) {
      throw new OAuthError('invalid_grant', 'Invalid refresh token');
    }

    // Check if session is revoked
    if (session.revokedAt) {
      throw new OAuthError('invalid_grant', 'Session has been revoked');
    }

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < now) {
      throw new OAuthError('invalid_grant', 'Session has expired');
    }

    // Rotate refresh token
    const newRefreshToken = `iw_rt_${generateSecureRandom(48)}`;
    const newRefreshTokenHash = await hashString(newRefreshToken);

    await db
      .update(mcpOAuthSessions)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        previousRefreshTokenHash: session.refreshTokenHash,
        previousTokenExpiresAt: now + PREV_TOKEN_GRACE_PERIOD,
        lastUsedAt: now,
        lastUsedIp: clientIp ?? session.lastUsedIp,
        lastUsedUserAgent: userAgent ?? session.lastUsedUserAgent,
        expiresAt: now + REFRESH_TOKEN_TTL * 1000,
      })
      .where(eq(mcpOAuthSessions.id, session.id));

    oauthLog.info(`Refreshed tokens for session ${session.id}`);

    // Generate new access token with current permissions
    return this.generateTokens(db, session.id, newRefreshToken, issuer, env);
  }

  /**
   * Generate access and refresh tokens for a session
   *
   * @param db - Database instance
   * @param sessionId - The session ID
   * @param refreshToken - The refresh token
   * @param issuer - The issuer URL
   * @param env - Optional Cloudflare env bindings (required on Workers)
   */
  private async generateTokens(
    db: DatabaseInstance,
    sessionId: string,
    refreshToken: string,
    issuer: string,
    env?: CloudflareEnv
  ): Promise<TokenResult> {
    // Get session with user and client info
    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new OAuthError('server_error', 'Session not found');
    }

    // Get user info
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);

    if (!user || !user.username) {
      throw new OAuthError('server_error', 'User not found');
    }

    // Get current grants for scope string only (not included in token to reduce size)
    const grants = await this.getSessionGrants(db, sessionId);

    // Build JWT payload (minimal - grants are looked up at request time)
    const now = Math.floor(Date.now() / 1000);
    const payload: McpAccessTokenPayload = {
      iss: issuer,
      sub: session.userId,
      aud: `${issuer}/api/v1/ai/mcp`,
      exp: now + ACCESS_TOKEN_TTL,
      iat: now,
      jti: crypto.randomUUID(),
      session_id: sessionId,
      client_id: session.clientId,
      username: user.username,
      grants: [], // Empty - grants looked up at request time from session
    };

    const accessToken = await sign(
      payload as unknown as Record<string, unknown>,
      this.getSecret(env),
      'HS256'
    );

    // Build scope string from grants (all unique permissions across all granted projects)
    // Always include mcp:tools and mcp:resources — some clients (e.g. Claude Desktop)
    // may expect these conventional MCP scopes to be present.
    const allPermissions = new Set<string>(['mcp:tools', 'mcp:resources']);
    for (const grant of grants) {
      for (const perm of grant.permissions) {
        allPermissions.add(perm);
      }
    }
    const scope = Array.from(allPermissions).join(' ');

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
      tokenType: 'Bearer',
      scope: scope || undefined,
    };
  }

  /**
   * Verify an access token and return the payload
   *
   * @param token - The JWT access token to verify
   * @param env - Optional Cloudflare env bindings (required on Workers)
   */
  async verifyAccessToken(
    token: string,
    env?: CloudflareEnv
  ): Promise<McpAccessTokenPayload | null> {
    try {
      const payload = await verify(token, this.getSecret(env), 'HS256');
      return payload as unknown as McpAccessTokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Revoke an OAuth session
   */
  async revokeSession(db: DatabaseInstance, sessionId: string, reason?: string): Promise<void> {
    const now = Date.now();

    await db
      .update(mcpOAuthSessions)
      .set({
        revokedAt: now,
        revokedReason: reason ?? 'User revoked',
      })
      .where(eq(mcpOAuthSessions.id, sessionId));

    // Remove collaborator entries for this session
    await db.delete(projectCollaborators).where(eq(projectCollaborators.mcpSessionId, sessionId));

    oauthLog.info(`Revoked OAuth session: ${sessionId}`);
  }

  /**
   * Check if an OAuth session has been revoked
   */
  async isSessionRevoked(db: DatabaseInstance, sessionId: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DatabaseInstance type doesn't support partial select
    const [session] = await (db as any)
      .select({ revokedAt: mcpOAuthSessions.revokedAt })
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, sessionId))
      .limit(1);

    // Session not found or has been revoked
    return !session || session.revokedAt !== null;
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(db: DatabaseInstance, refreshToken: string): Promise<void> {
    const refreshTokenHash = await hashString(refreshToken);

    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.refreshTokenHash, refreshTokenHash))
      .limit(1);

    if (session) {
      await this.revokeSession(db, session.id, 'Token revoked');
    }
  }

  // ============================================
  // Grant Management
  // ============================================

  /**
   * Get all project grants for a session
   */
  async getSessionGrants(
    db: DatabaseInstance,
    sessionId: string
  ): Promise<
    Array<{
      projectId: string;
      projectSlug: string;
      ownerUsername: string;
      role: CollaboratorRole;
      permissions: string[];
    }>
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle join result type is complex
    const collaborators = await (db as any)
      .select({
        projectId: projectCollaborators.projectId,
        role: projectCollaborators.role,
        projectSlug: projects.slug,
        ownerUsername: users.username,
      })
      .from(projectCollaborators)
      .innerJoin(projects, eq(projectCollaborators.projectId, projects.id))
      .innerJoin(users, eq(projects.userId, users.id))
      .where(eq(projectCollaborators.mcpSessionId, sessionId));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return collaborators.map((c: any) => ({
      projectId: c.projectId,
      projectSlug: c.projectSlug,
      ownerUsername: c.ownerUsername || '',
      role: c.role as CollaboratorRole,
      permissions: roleToMcpPermissions(c.role as CollaboratorRole),
    }));
  }

  /**
   * Grant access to a project for an OAuth session
   */
  async grantProjectAccess(
    db: DatabaseInstance,
    sessionId: string,
    projectId: string,
    role: CollaboratorRole,
    grantedBy: string
  ): Promise<void> {
    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error('Session not found');
    }

    const now = Date.now();

    await db.insert(projectCollaborators).values({
      projectId,
      userId: session.userId,
      mcpSessionId: sessionId,
      collaboratorType: 'oauth_app',
      role,
      status: 'accepted',
      invitedBy: grantedBy,
      invitedAt: now,
      acceptedAt: now,
    });

    oauthLog.info(`Granted ${role} access to project ${projectId} for session ${sessionId}`);
  }

  /**
   * Revoke access to a specific project for an OAuth session
   */
  async revokeProjectAccess(
    db: DatabaseInstance,
    sessionId: string,
    projectId: string
  ): Promise<void> {
    await db
      .delete(projectCollaborators)
      .where(
        and(
          eq(projectCollaborators.mcpSessionId, sessionId),
          eq(projectCollaborators.projectId, projectId)
        )
      );

    oauthLog.info(`Revoked access to project ${projectId} for session ${sessionId}`);
  }

  /**
   * Update role for a project grant
   */
  async updateProjectRole(
    db: DatabaseInstance,
    sessionId: string,
    projectId: string,
    role: CollaboratorRole
  ): Promise<void> {
    await db
      .update(projectCollaborators)
      .set({ role })
      .where(
        and(
          eq(projectCollaborators.mcpSessionId, sessionId),
          eq(projectCollaborators.projectId, projectId)
        )
      );

    oauthLog.info(`Updated role to ${role} for project ${projectId}, session ${sessionId}`);
  }

  // ============================================
  // Connected Apps UI
  // ============================================

  /**
   * Get all active OAuth sessions for a user (for Connected Apps UI)
   */
  async getUserSessions(db: DatabaseInstance, userId: string): Promise<PublicOAuthSession[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle join result type is complex
    const sessions = await (db as any)
      .select({
        id: mcpOAuthSessions.id,
        clientId: mcpOAuthSessions.clientId,
        clientName: mcpOAuthClients.clientName,
        logoUri: mcpOAuthClients.logoUri,
        createdAt: mcpOAuthSessions.createdAt,
        lastUsedAt: mcpOAuthSessions.lastUsedAt,
      })
      .from(mcpOAuthSessions)
      .innerJoin(mcpOAuthClients, eq(mcpOAuthSessions.clientId, mcpOAuthClients.id))
      .where(and(eq(mcpOAuthSessions.userId, userId), isNull(mcpOAuthSessions.revokedAt)));

    // Count projects for each session
    const result: PublicOAuthSession[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const session of sessions as any[]) {
      const grants = await this.getSessionGrants(db, session.id);
      result.push({
        id: session.id,
        client: {
          id: session.clientId,
          name: session.clientName,
          logoUri: session.logoUri,
        },
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        projectCount: grants.length,
      });
    }

    return result;
  }

  /**
   * Get session details with all grants
   */
  async getSessionDetails(
    db: DatabaseInstance,
    sessionId: string,
    userId: string
  ): Promise<{
    session: PublicOAuthSession;
    grants: Array<{
      projectId: string;
      projectTitle: string;
      projectSlug: string;
      role: CollaboratorRole;
    }>;
  } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle join result type is complex
    const sessions = await (db as any)
      .select({
        id: mcpOAuthSessions.id,
        clientId: mcpOAuthSessions.clientId,
        clientName: mcpOAuthClients.clientName,
        logoUri: mcpOAuthClients.logoUri,
        createdAt: mcpOAuthSessions.createdAt,
        lastUsedAt: mcpOAuthSessions.lastUsedAt,
      })
      .from(mcpOAuthSessions)
      .innerJoin(mcpOAuthClients, eq(mcpOAuthSessions.clientId, mcpOAuthClients.id))
      .where(
        and(
          eq(mcpOAuthSessions.id, sessionId),
          eq(mcpOAuthSessions.userId, userId),
          isNull(mcpOAuthSessions.revokedAt)
        )
      )
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = sessions[0] as any;
    if (!session) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle join result type is complex
    const grants = await (db as any)
      .select({
        projectId: projectCollaborators.projectId,
        projectTitle: projects.title,
        projectSlug: projects.slug,
        role: projectCollaborators.role,
      })
      .from(projectCollaborators)
      .innerJoin(projects, eq(projectCollaborators.projectId, projects.id))
      .where(eq(projectCollaborators.mcpSessionId, sessionId));

    const grantsWithCount = await this.getSessionGrants(db, session.id);

    return {
      session: {
        id: session.id,
        client: {
          id: session.clientId,
          name: session.clientName,
          logoUri: session.logoUri,
        },
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        projectCount: grantsWithCount.length,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      grants: (grants as any[]).map((g) => ({
        projectId: g.projectId,
        projectTitle: g.projectTitle,
        projectSlug: g.projectSlug,
        role: g.role as CollaboratorRole,
      })),
    };
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Clean up expired authorization codes
   */
  async cleanupExpiredCodes(db: DatabaseInstance): Promise<number> {
    const result = await db.delete(mcpOAuthCodes).where(lt(mcpOAuthCodes.expiresAt, Date.now()));

    return result.rowsAffected ?? 0;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(db: DatabaseInstance): Promise<number> {
    const now = Date.now();

    // Get expired session IDs
    const expiredSessions = await db
      .select()
      .from(mcpOAuthSessions)
      .where(and(isNull(mcpOAuthSessions.revokedAt), lt(mcpOAuthSessions.expiresAt, now)));

    // Remove collaborator entries
    for (const session of expiredSessions) {
      await db
        .delete(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, session.id));
    }

    // Delete sessions
    const result = await db
      .delete(mcpOAuthSessions)
      .where(and(isNull(mcpOAuthSessions.revokedAt), lt(mcpOAuthSessions.expiresAt, now)));

    return result.rowsAffected ?? 0;
  }
}

/**
 * OAuth Error class for standard error responses
 */
export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'OAuthError';
  }

  toJSON() {
    return {
      error: this.code,
      error_description: this.message,
    };
  }
}

export const mcpOAuthService = new McpOAuthService();
