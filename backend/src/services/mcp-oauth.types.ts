import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { McpOAuthClient } from '../db/schema/mcp-oauth-clients';

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
 * OAuth Error class for standard error responses
 */
export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: ContentfulStatusCode = 400
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
