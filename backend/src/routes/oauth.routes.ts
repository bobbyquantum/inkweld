/**
 * MCP OAuth 2.1 Authorization Routes
 *
 * Implements OAuth 2.1 endpoints for MCP client authorization:
 * - Discovery endpoints (RFC 8414, RFC 9728)
 * - Dynamic Client Registration (RFC 7591)
 * - Authorization endpoint with consent UI
 * - Token endpoint with PKCE
 * - Revocation endpoint
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { AppContext } from '../types/context';
import { requireAuth } from '../middleware/auth';
import { mcpOAuthService, OAuthError, type CloudflareEnv } from '../services/mcp-oauth.service';
import { projectService } from '../services/project.service';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { logger } from '../services/logger.service';

const oauthRoutes = new OpenAPIHono<AppContext>();

// ============================================
// Schemas
// ============================================

const OAuthErrorSchema = z
  .object({
    error: z.string(),
    error_description: z.string().optional(),
  })
  .openapi('OAuthError');

const ClientRegistrationRequestSchema = z
  .object({
    client_name: z.string().min(1).max(100),
    redirect_uris: z.array(z.string().url()).min(1),
    client_uri: z.string().url().optional(),
    logo_uri: z.string().url().optional(),
    contacts: z.array(z.string().email()).optional(),
    policy_uri: z.string().url().optional(),
    tos_uri: z.string().url().optional(),
    token_endpoint_auth_method: z
      .enum(['none', 'client_secret_basic', 'client_secret_post'])
      .optional(),
  })
  .openapi('ClientRegistrationRequest');

const ClientRegistrationResponseSchema = z
  .object({
    client_id: z.string(),
    client_secret: z.string().optional(),
    client_secret_expires_at: z.number(),
    client_name: z.string(),
    redirect_uris: z.array(z.string()),
    // Optional fields - only included if provided in request (never null/empty)
    client_uri: z.string().url().optional(),
    logo_uri: z.string().url().optional(),
    policy_uri: z.string().url().optional(),
    tos_uri: z.string().url().optional(),
    token_endpoint_auth_method: z.enum(['none', 'client_secret_basic', 'client_secret_post']),
  })
  .openapi('ClientRegistrationResponse');

const TokenRequestSchema = z
  .object({
    grant_type: z.enum(['authorization_code', 'refresh_token']),
    code: z.string().optional(),
    redirect_uri: z.string().optional(),
    code_verifier: z.string().optional(),
    refresh_token: z.string().optional(),
    client_id: z.string(),
    client_secret: z.string().optional(),
  })
  .openapi('TokenRequest');

const TokenResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.literal('Bearer'),
    expires_in: z.number(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
  })
  .openapi('TokenResponse');

const PublicClientSchema = z
  .object({
    id: z.string(),
    clientName: z.string(),
    clientUri: z.string().nullable(),
    logoUri: z.string().nullable(),
  })
  .openapi('PublicOAuthClient');

const AuthorizationInfoSchema = z
  .object({
    client: PublicClientSchema,
    projects: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        slug: z.string(),
      })
    ),
    scope: z.string().optional(),
    state: z.string().optional(),
  })
  .openapi('AuthorizationInfo');

const ConsentRequestSchema = z
  .object({
    grants: z.array(
      z.object({
        projectId: z.string(),
        role: z.enum(['viewer', 'editor', 'admin']),
      })
    ),
  })
  .openapi('ConsentRequest');

const ConsentResponseSchema = z
  .object({
    redirectUri: z.string(),
  })
  .openapi('ConsentResponse');

const PublicSessionSchema = z
  .object({
    id: z.string(),
    client: z.object({
      id: z.string(),
      name: z.string(),
      logoUri: z.string().nullable(),
    }),
    createdAt: z.number(),
    lastUsedAt: z.number().nullable(),
    projectCount: z.number(),
  })
  .openapi('PublicOAuthSession');

const SessionDetailsSchema = z
  .object({
    session: PublicSessionSchema,
    grants: z.array(
      z.object({
        projectId: z.string(),
        projectTitle: z.string(),
        projectSlug: z.string(),
        role: z.enum(['viewer', 'editor', 'admin']),
      })
    ),
  })
  .openapi('OAuthSessionDetails');

// ============================================
// Discovery Endpoints
// ============================================

/**
 * Protected Resource Metadata (RFC 9728)
 */
const protectedResourceMetadataRoute = createRoute({
  method: 'get',
  path: '/.well-known/oauth-protected-resource',
  tags: ['OAuth'],
  operationId: 'getProtectedResourceMetadata',
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({}).passthrough() } },
      description: 'Protected resource metadata',
    },
  },
});

oauthRoutes.openapi(protectedResourceMetadataRoute, (c) => {
  // Note: On Cloudflare Workers, use c.env; on Bun/Node, use process.env
  const baseUrl =
    (c.env as Record<string, string>)?.BASE_URL ||
    process.env.BASE_URL ||
    c.req.url.split('/.well-known')[0];

  return c.json({
    resource: `${baseUrl}/api/v1/ai/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs/api`,
    // RFC 9728 Section 3.2: scopes_supported for this resource
    scopes_supported: [
      'mcp:tools',
      'mcp:resources',
      'read:project',
      'read:elements',
      'read:worldbuilding',
      'read:schemas',
      'write:elements',
      'write:worldbuilding',
    ],
  });
});

/**
 * Path-specific Protected Resource Metadata (RFC 9728)
 * Clients may request metadata for a specific resource path like:
 * /.well-known/oauth-protected-resource/api/v1/ai/mcp
 * This returns the same metadata as the server-wide endpoint.
 * Using wildcard (*) to match any path with slashes.
 */
const pathSpecificProtectedResourceRoute = createRoute({
  method: 'get',
  path: '/.well-known/oauth-protected-resource/*',
  tags: ['OAuth'],
  operationId: 'getPathSpecificProtectedResourceMetadata',
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({}).passthrough() } },
      description: 'Protected resource metadata for specific path',
    },
  },
});

oauthRoutes.openapi(pathSpecificProtectedResourceRoute, (c) => {
  const baseUrl =
    (c.env as Record<string, string>)?.BASE_URL ||
    process.env.BASE_URL ||
    c.req.url.split('/.well-known')[0];

  // Return the same metadata - our MCP endpoint is the protected resource
  return c.json({
    resource: `${baseUrl}/api/v1/ai/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs/api`,
    // RFC 9728 Section 3.2: scopes_supported for this resource
    scopes_supported: [
      'mcp:tools',
      'mcp:resources',
      'read:project',
      'read:elements',
      'read:worldbuilding',
      'read:schemas',
      'write:elements',
      'write:worldbuilding',
    ],
  });
});

/**
 * Authorization Server Metadata (RFC 8414)
 */
const authServerMetadataRoute = createRoute({
  method: 'get',
  path: '/.well-known/oauth-authorization-server',
  tags: ['OAuth'],
  operationId: 'getAuthServerMetadata',
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({}).passthrough() } },
      description: 'Authorization server metadata',
    },
  },
});

oauthRoutes.openapi(authServerMetadataRoute, (c) => {
  // Note: On Cloudflare Workers, use c.env; on Bun/Node, use process.env
  const baseUrl =
    (c.env as Record<string, string>)?.BASE_URL ||
    process.env.BASE_URL ||
    c.req.url.split('/.well-known')[0];

  // For split deployments (e.g., Cloudflare with separate frontend/backend domains),
  // the authorization_endpoint should point to the frontend where the user will
  // authenticate and provide consent. For combined deployments (Bun, Docker),
  // the backend serves the SPA so they're the same URL.
  // Note: On Cloudflare Workers, use c.env; on Bun/Node, use process.env
  const allowedOrigins =
    (c.env as Record<string, string>)?.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '';
  const frontendUrl = allowedOrigins.split(',')[0]?.trim() || baseUrl;

  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${frontendUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [
      'mcp:tools',
      'mcp:resources',
      'read:project',
      'read:elements',
      'read:worldbuilding',
      'read:schemas',
      'write:elements',
      'write:worldbuilding',
    ],
  });
});

/**
 * OpenID Connect Discovery (RFC 8414 compatible)
 * Some clients (like Claude) try OIDC discovery as a fallback.
 * We return OAuth 2.0 metadata which is compatible.
 */
const openidConfigurationRoute = createRoute({
  method: 'get',
  path: '/.well-known/openid-configuration',
  tags: ['OAuth'],
  operationId: 'getOpenIdConfiguration',
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({}).passthrough() } },
      description: 'OpenID Connect discovery document',
    },
  },
});

oauthRoutes.openapi(openidConfigurationRoute, (c) => {
  const baseUrl =
    (c.env as Record<string, string>)?.BASE_URL ||
    process.env.BASE_URL ||
    c.req.url.split('/.well-known')[0];

  const allowedOrigins =
    (c.env as Record<string, string>)?.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '';
  const frontendUrl = allowedOrigins.split(',')[0]?.trim() || baseUrl;

  // Return OAuth 2.0 + minimal OIDC-compatible metadata
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${frontendUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [
      'mcp:tools',
      'mcp:resources',
      'read:project',
      'read:elements',
      'read:worldbuilding',
      'read:schemas',
      'write:elements',
      'write:worldbuilding',
    ],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  });
});

// ============================================
// Dynamic Client Registration (RFC 7591)
// ============================================

const registerClientRoute = createRoute({
  method: 'post',
  path: '/oauth/register',
  tags: ['OAuth'],
  operationId: 'registerOAuthClient',
  request: {
    body: {
      content: { 'application/json': { schema: ClientRegistrationRequestSchema } },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: ClientRegistrationResponseSchema } },
      description: 'Client registered successfully',
    },
    400: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Invalid registration request',
    },
  },
});

/**
 * Alias route for /register (without /oauth prefix)
 * Some MCP clients may strip the path prefix.
 */
const registerClientAliasRoute = createRoute({
  method: 'post',
  path: '/register',
  tags: ['OAuth'],
  operationId: 'registerOAuthClientAlias',
  request: {
    body: {
      content: { 'application/json': { schema: ClientRegistrationRequestSchema } },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: ClientRegistrationResponseSchema } },
      description: 'Client registered successfully',
    },
    400: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Invalid registration request',
    },
  },
});

// Shared handler for client registration (used by both /oauth/register and /register)
const registerClientHandler = async (c: Context<AppContext>) => {
  const db = c.get('db');
  const body = c.req.valid('json');

  try {
    const result = await mcpOAuthService.registerClient(db, {
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
      clientUri: body.client_uri,
      logoUri: body.logo_uri,
      contactEmail: body.contacts?.[0],
      policyUri: body.policy_uri,
      tosUri: body.tos_uri,
      clientType: body.token_endpoint_auth_method === 'none' ? 'public' : 'confidential',
    });

    // Build response - only include optional URI fields if they were provided
    // Returning null/empty strings causes Claude's Zod validation to fail (DCR empty-fields bug)
    const response: Record<string, unknown> = {
      client_id: result.clientId,
      client_secret: result.clientSecret,
      client_secret_expires_at: result.clientSecretExpiresAt,
      client_name: result.clientName,
      redirect_uris: result.redirectUris,
      token_endpoint_auth_method: result.tokenEndpointAuthMethod,
    };

    // Only include URIs if they exist (not null/undefined/empty)
    if (result.clientUri) response.client_uri = result.clientUri;
    if (result.logoUri) response.logo_uri = result.logoUri;
    if (result.policyUri) response.policy_uri = result.policyUri;
    if (result.tosUri) response.tos_uri = result.tosUri;

    return c.json(response, 201);
  } catch (error) {
    if (error instanceof OAuthError) {
      return c.json(error.toJSON(), error.statusCode as 400);
    }
    throw error;
  }
};

oauthRoutes.openapi(registerClientRoute, registerClientHandler);
oauthRoutes.openapi(registerClientAliasRoute, registerClientHandler);

// ============================================
// Authorization Endpoint
// ============================================

/**
 * GET /oauth/authorize - Authorization info endpoint
 *
 * Primary flow: OAuth metadata points browsers directly to the frontend
 * `/oauth/authorize` page. The frontend handles login, shows consent UI,
 * and calls this endpoint to get authorization info.
 *
 * Fallback: If a browser somehow hits this backend endpoint directly
 * (e.g., old cached metadata, manual URL entry), we redirect to the frontend.
 *
 * For API requests from the frontend, returns authorization info JSON.
 */
const getAuthorizationInfoRoute = createRoute({
  method: 'get',
  path: '/oauth/authorize',
  tags: ['OAuth'],
  operationId: 'getAuthorizationInfo',
  request: {
    query: z.object({
      client_id: z.string(),
      redirect_uri: z.string(),
      response_type: z.string(),
      scope: z.string().optional(),
      state: z.string().optional(),
      code_challenge: z.string(),
      code_challenge_method: z.string(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: AuthorizationInfoSchema } },
      description: 'Authorization info for consent page',
    },
    302: {
      description: 'Redirect to frontend consent page (for browser requests)',
    },
    400: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Invalid authorization request',
    },
    401: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'User not authenticated',
    },
  },
});

// Use optionalAuth for GET - we may redirect unauthenticated browser requests
oauthRoutes.use('/oauth/authorize', async (c, next) => {
  // Only apply requireAuth for POST requests (consent submission)
  // GET requests need optionalAuth to handle browser redirects
  if (c.req.method === 'POST') {
    const db = c.get('db');
    const user = await authService.getUserFromSession(db, c);
    if (!user || !userService.canLogin(user)) {
      return c.json({ error: 'unauthorized', error_description: 'User not authenticated' }, 401);
    }
    c.set('user', user);
  } else {
    // For GET, use optional auth
    const db = c.get('db');
    const user = await authService.getUserFromSession(db, c);
    if (user && userService.canLogin(user)) {
      c.set('user', user);
    }
  }
  return next();
});

oauthRoutes.openapi(getAuthorizationInfoRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const query = c.req.valid('query');

  // Check if this is a browser request (Accept header includes text/html)
  const acceptHeader = c.req.header('Accept') || '';
  const isBrowserRequest = acceptHeader.includes('text/html');

  // If user is not authenticated and this is a browser request,
  // redirect to the frontend consent page which will handle login
  if (!user) {
    if (isBrowserRequest) {
      // Get frontend URL from ALLOWED_ORIGINS (first origin is the frontend)
      // Note: On Cloudflare Workers, use c.env; on Bun/Node, use process.env
      const allowedOrigins =
        (c.env as Record<string, string>)?.ALLOWED_ORIGINS ||
        process.env.ALLOWED_ORIGINS ||
        'http://localhost:4200';
      const frontendUrl = allowedOrigins.split(',')[0].trim();

      // Build the frontend OAuth consent URL with all query parameters
      const frontendAuthUrl = new URL('/oauth/authorize', frontendUrl);
      frontendAuthUrl.searchParams.set('client_id', query.client_id);
      frontendAuthUrl.searchParams.set('redirect_uri', query.redirect_uri);
      frontendAuthUrl.searchParams.set('response_type', query.response_type);
      frontendAuthUrl.searchParams.set('code_challenge', query.code_challenge);
      frontendAuthUrl.searchParams.set('code_challenge_method', query.code_challenge_method);
      if (query.scope) {
        frontendAuthUrl.searchParams.set('scope', query.scope);
      }
      if (query.state) {
        frontendAuthUrl.searchParams.set('state', query.state);
      }

      return c.redirect(frontendAuthUrl.toString(), 302);
    }

    // For API requests without auth, return 401
    return c.json({ error: 'unauthorized', error_description: 'User not authenticated' }, 401);
  }

  try {
    // Validate authorization request
    const authRequest = await mcpOAuthService.parseAuthorizationRequest(db, query);

    // Get user's projects
    const userProjects = await projectService.findByUserId(db, user.id);

    return c.json({
      client: {
        id: authRequest.client.id,
        clientName: authRequest.client.clientName,
        clientUri: authRequest.client.clientUri,
        logoUri: authRequest.client.logoUri,
      },
      projects: userProjects.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
      })),
      scope: authRequest.scope,
      state: authRequest.state,
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      return c.json(error.toJSON(), error.statusCode as 400);
    }
    throw error;
  }
});

/**
 * POST /oauth/authorize - Submit consent (creates authorization code)
 * Requires user session
 */
const submitConsentRoute = createRoute({
  method: 'post',
  path: '/oauth/authorize',
  tags: ['OAuth'],
  operationId: 'submitConsent',
  request: {
    query: z.object({
      client_id: z.string(),
      redirect_uri: z.string(),
      response_type: z.string(),
      scope: z.string().optional(),
      state: z.string().optional(),
      code_challenge: z.string(),
      code_challenge_method: z.string(),
    }),
    body: {
      content: { 'application/json': { schema: ConsentRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ConsentResponseSchema } },
      description: 'Consent submitted, redirect with code',
    },
    400: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Invalid request',
    },
  },
});

// @ts-expect-error OpenAPI handler return type mismatch
oauthRoutes.openapi(submitConsentRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const query = c.req.valid('query');
  const body = c.req.valid('json');

  if (!user) {
    return c.json({ error: 'unauthorized', error_description: 'User not authenticated' }, 401);
  }

  try {
    // Validate authorization request
    const authRequest = await mcpOAuthService.parseAuthorizationRequest(db, query);

    // Validate that user owns the granted projects
    const userProjects = await projectService.findByUserId(db, user.id);
    const userProjectIds = new Set(userProjects.map((p) => p.id));

    for (const grant of body.grants) {
      if (!userProjectIds.has(grant.projectId)) {
        return c.json(
          {
            error: 'invalid_request',
            error_description: 'You do not own one or more of the selected projects',
          },
          400
        );
      }
    }

    // Create authorization code
    const code = await mcpOAuthService.createAuthorizationCode(db, {
      userId: user.id,
      clientId: authRequest.clientId,
      redirectUri: authRequest.redirectUri,
      codeChallenge: authRequest.codeChallenge,
      codeChallengeMethod: authRequest.codeChallengeMethod,
      grants: body.grants,
      scope: authRequest.scope,
      state: authRequest.state,
    });

    // Build redirect URI with code
    const redirectUrl = new URL(authRequest.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (authRequest.state) {
      redirectUrl.searchParams.set('state', authRequest.state);
    }

    const redirectUri = redirectUrl.toString();
    logger.info('OAuth', `Consent approved, redirecting to: ${redirectUri.substring(0, 100)}...`);

    return c.json({ redirectUri });
  } catch (error) {
    if (error instanceof OAuthError) {
      return c.json(error.toJSON(), error.statusCode as 400);
    }
    throw error;
  }
});

// ============================================
// Token Endpoint
// ============================================

const tokenRoute = createRoute({
  method: 'post',
  path: '/oauth/token',
  tags: ['OAuth'],
  operationId: 'exchangeToken',
  request: {
    body: {
      content: {
        'application/x-www-form-urlencoded': { schema: TokenRequestSchema },
        'application/json': { schema: TokenRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: TokenResponseSchema } },
      description: 'Token issued successfully',
    },
    400: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Invalid token request',
    },
  },
});

// @ts-expect-error OpenAPI handler return type mismatch
oauthRoutes.openapi(tokenRoute, async (c) => {
  const db = c.get('db');

  // Parse body (support both form and JSON)
  let body: z.infer<typeof TokenRequestSchema>;
  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.parseBody();
    body = {
      grant_type: formData.grant_type as 'authorization_code' | 'refresh_token',
      code: formData.code as string | undefined,
      redirect_uri: formData.redirect_uri as string | undefined,
      code_verifier: formData.code_verifier as string | undefined,
      refresh_token: formData.refresh_token as string | undefined,
      client_id: formData.client_id as string,
      client_secret: formData.client_secret as string | undefined,
    };
  } else {
    body = await c.req.json();
  }

  const clientIp =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip');
  const userAgent = c.req.header('user-agent');
  const issuer =
    (c.env as Record<string, string>)?.BASE_URL || process.env.BASE_URL || 'https://inkweld.app';

  try {
    if (body.grant_type === 'authorization_code') {
      // Exchange authorization code for tokens
      if (!body.code || !body.code_verifier || !body.redirect_uri) {
        return c.json(
          {
            error: 'invalid_request',
            error_description: 'code, code_verifier, and redirect_uri are required',
          },
          400
        );
      }

      const tokens = await mcpOAuthService.exchangeAuthorizationCode(
        db,
        {
          code: body.code,
          codeVerifier: body.code_verifier,
          clientId: body.client_id,
          redirectUri: body.redirect_uri,
          issuer,
          clientIp,
          userAgent,
        },
        c.env as CloudflareEnv
      );

      const tokenResponse = {
        access_token: tokens.accessToken,
        token_type: tokens.tokenType,
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: tokens.scope,
      };

      return c.json(tokenResponse);
    } else if (body.grant_type === 'refresh_token') {
      // Refresh tokens
      if (!body.refresh_token) {
        return c.json(
          { error: 'invalid_request', error_description: 'refresh_token is required' },
          400
        );
      }

      const tokens = await mcpOAuthService.refreshTokens(
        db,
        body.refresh_token,
        issuer,
        clientIp,
        userAgent,
        c.env as CloudflareEnv
      );

      return c.json({
        access_token: tokens.accessToken,
        token_type: tokens.tokenType,
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: tokens.scope,
      });
    } else {
      return c.json(
        {
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code and refresh_token are supported',
        },
        400
      );
    }
  } catch (error) {
    if (error instanceof OAuthError) {
      logger.warn('OAuth', `Token endpoint error: ${error.code} - ${error.message}`, {
        error: error.code,
        description: error.message,
        clientId: body.client_id,
        grantType: body.grant_type,
      });
      return c.json(error.toJSON(), error.statusCode as 400);
    }
    throw error;
  }
});

// ============================================
// Revocation Endpoint
// ============================================

const revokeRoute = createRoute({
  method: 'post',
  path: '/oauth/revoke',
  tags: ['OAuth'],
  operationId: 'revokeToken',
  request: {
    body: {
      content: {
        'application/x-www-form-urlencoded': {
          schema: z.object({
            token: z.string(),
            token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Token revoked (or was already invalid)',
    },
  },
});

oauthRoutes.openapi(revokeRoute, async (c) => {
  const db = c.get('db');
  const formData = await c.req.parseBody();
  const token = formData.token as string;

  if (token) {
    // Try to revoke as refresh token
    await mcpOAuthService.revokeRefreshToken(db, token);
  }

  // Always return 200 per RFC 7009
  return c.text('', 200);
});

// ============================================
// Connected Apps Management (User-facing)
// ============================================

// Apply auth middleware for all connected apps routes
oauthRoutes.use('/oauth/sessions/*', requireAuth);
oauthRoutes.use('/oauth/sessions', requireAuth);

/**
 * List user's connected apps
 */
const listSessionsRoute = createRoute({
  method: 'get',
  path: '/oauth/sessions',
  tags: ['OAuth'],
  operationId: 'listOAuthSessions',
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(PublicSessionSchema) } },
      description: 'List of connected apps',
    },
  },
});

oauthRoutes.openapi(listSessionsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new OAuthError('invalid_token', 'Not authenticated');
  }

  const sessions = await mcpOAuthService.getUserSessions(db, user.id);
  return c.json(sessions);
});

/**
 * Get session details
 */
const getSessionDetailsRoute = createRoute({
  method: 'get',
  path: '/oauth/sessions/{sessionId}',
  tags: ['OAuth'],
  operationId: 'getOAuthSessionDetails',
  request: {
    params: z.object({ sessionId: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SessionDetailsSchema } },
      description: 'Session details with grants',
    },
    404: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Session not found',
    },
  },
});

// @ts-expect-error OpenAPI handler return type mismatch
oauthRoutes.openapi(getSessionDetailsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { sessionId } = c.req.valid('param');

  if (!user) {
    throw new OAuthError('invalid_token', 'Not authenticated');
  }

  const details = await mcpOAuthService.getSessionDetails(db, sessionId, user.id);

  if (!details) {
    return c.json({ error: 'not_found', error_description: 'Session not found' }, 404);
  }

  return c.json(details);
});

/**
 * Revoke a session (disconnect app)
 */
const revokeSessionRoute = createRoute({
  method: 'delete',
  path: '/oauth/sessions/{sessionId}',
  tags: ['OAuth'],
  operationId: 'revokeOAuthSession',
  request: {
    params: z.object({ sessionId: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      description: 'Session revoked',
    },
    404: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Session not found',
    },
  },
});

// @ts-expect-error OpenAPI handler return type mismatch
oauthRoutes.openapi(revokeSessionRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { sessionId } = c.req.valid('param');

  if (!user) {
    throw new OAuthError('invalid_token', 'Not authenticated');
  }

  // Verify session belongs to user
  const details = await mcpOAuthService.getSessionDetails(db, sessionId, user.id);

  if (!details) {
    return c.json({ error: 'not_found', error_description: 'Session not found' }, 404);
  }

  await mcpOAuthService.revokeSession(db, sessionId, 'User revoked via Connected Apps');

  return c.json({ message: 'Session revoked successfully' });
});

/**
 * Update session grant (change role for a project)
 */
const updateGrantRoute = createRoute({
  method: 'patch',
  path: '/oauth/sessions/{sessionId}/grants/{projectId}',
  tags: ['OAuth'],
  operationId: 'updateOAuthGrant',
  request: {
    params: z.object({
      sessionId: z.string(),
      projectId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            role: z.enum(['viewer', 'editor', 'admin']),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      description: 'Grant updated',
    },
    404: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Session or project not found',
    },
  },
});

// @ts-expect-error OpenAPI handler return type mismatch
oauthRoutes.openapi(updateGrantRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { sessionId, projectId } = c.req.valid('param') as { sessionId: string; projectId: string };
  const { role } = c.req.valid('json');

  if (!user) {
    throw new OAuthError('invalid_token', 'Not authenticated');
  }

  // Verify session belongs to user
  const details = await mcpOAuthService.getSessionDetails(db, sessionId, user.id);

  if (!details) {
    return c.json({ error: 'not_found', error_description: 'Session not found' }, 404);
  }

  await mcpOAuthService.updateProjectRole(db, sessionId, projectId, role);

  return c.json({ message: 'Grant updated successfully' });
});

/**
 * Revoke access to a specific project
 */
const revokeGrantRoute = createRoute({
  method: 'delete',
  path: '/oauth/sessions/{sessionId}/grants/{projectId}',
  tags: ['OAuth'],
  operationId: 'revokeOAuthGrant',
  request: {
    params: z.object({
      sessionId: z.string(),
      projectId: z.string(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      description: 'Grant revoked',
    },
    404: {
      content: { 'application/json': { schema: OAuthErrorSchema } },
      description: 'Session not found',
    },
  },
});

// @ts-expect-error OpenAPI handler return type mismatch
oauthRoutes.openapi(revokeGrantRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { sessionId, projectId } = c.req.valid('param') as { sessionId: string; projectId: string };

  if (!user) {
    throw new OAuthError('invalid_token', 'Not authenticated');
  }

  // Verify session belongs to user
  const details = await mcpOAuthService.getSessionDetails(db, sessionId, user.id);

  if (!details) {
    return c.json({ error: 'not_found', error_description: 'Session not found' }, 404);
  }

  await mcpOAuthService.revokeProjectAccess(db, sessionId, projectId);

  return c.json({ message: 'Grant revoked successfully' });
});

export default oauthRoutes;
