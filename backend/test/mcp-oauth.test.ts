import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  setSystemTime,
} from 'bun:test';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import * as schema from '../src/db/schema';
import { mcpOAuthService, OAuthError } from '../src/services/mcp-oauth.service';
import { userService } from '../src/services/user.service';
import { mcpOAuthClients } from '../src/db/schema/mcp-oauth-clients';
import { mcpOAuthCodes } from '../src/db/schema/mcp-oauth-codes';
import { mcpOAuthSessions } from '../src/db/schema/mcp-oauth-sessions';
import { projectCollaborators } from '../src/db/schema/project-collaborators';
import { projects } from '../src/db/schema/projects';
import { users } from '../src/db/schema/users';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;
let testUserId: string;
let testProjectId: string;
let testProject2Id: string;
let testClientId: string;
let testClient2Id: string;
let testConfidentialClientId: string;
let testConfidentialClientSecret: string;

beforeAll(async () => {
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });

  const migrationsFolder = join(__dirname, '../drizzle');
  migrate(db, { migrationsFolder });

  // Create test user
  testUserId = crypto.randomUUID();
  await db.insert(users).values({
    id: testUserId,
    username: 'oauthtest',
    email: 'oauthtest@example.com',
    password: 'hash',
    approved: true,
    enabled: true,
    isAdmin: false,
  });

  // Create test projects
  testProjectId = crypto.randomUUID();
  testProject2Id = crypto.randomUUID();
  const now = Date.now();
  await db.insert(projects).values([
    {
      id: testProjectId,
      title: 'OAuth Test Project',
      slug: 'oauth-test-project',
      userId: testUserId,
      createdDate: now,
      updatedDate: now,
    },
    {
      id: testProject2Id,
      title: 'OAuth Test Project 2',
      slug: 'oauth-test-project-2',
      userId: testUserId,
      createdDate: now,
      updatedDate: now,
    },
  ]);

  // Create test OAuth clients
  testClientId = crypto.randomUUID();
  testClient2Id = crypto.randomUUID();
  await db.insert(mcpOAuthClients).values([
    {
      id: testClientId,
      clientName: 'Test Agent',
      redirectUris: JSON.stringify(['http://localhost:3000/callback']),
      clientType: 'public',
      isDynamic: true,
      createdAt: now,
    },
    {
      id: testClient2Id,
      clientName: 'Different Agent',
      redirectUris: JSON.stringify(['http://localhost:4000/callback']),
      clientType: 'public',
      isDynamic: true,
      createdAt: now,
    },
  ]);

  // Create a confidential client for client_secret tests
  const registration = await mcpOAuthService.registerClient(db, {
    clientName: 'Confidential Agent',
    redirectUris: ['http://localhost:5000/callback'],
    clientType: 'confidential',
  });
  testConfidentialClientId = registration.clientId;
  testConfidentialClientSecret = registration.clientSecret ?? '';
  if (!testConfidentialClientSecret) {
    throw new Error('Expected clientSecret for confidential client');
  }
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clean up sessions, collaborators, and codes between tests
  await db.delete(projectCollaborators);
  await db.delete(mcpOAuthSessions);
  await db.delete(mcpOAuthCodes);
});

describe('MCP OAuth Service - Session Management', () => {
  describe('createSession', () => {
    it('should create a session with collaborator entries', async () => {
      const { sessionId, tokens } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'editor' }],
        issuer: 'http://localhost:8333',
      });

      expect(sessionId).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      // Verify session was created
      const [session] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, sessionId));
      expect(session).toBeDefined();
      expect(session.userId).toBe(testUserId);
      expect(session.clientId).toBe(testClientId);

      // Verify collaborator entry was created
      const collabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, sessionId));
      expect(collabs).toHaveLength(1);
      expect(collabs[0].projectId).toBe(testProjectId);
      expect(collabs[0].collaboratorType).toBe('oauth_app');
      expect(collabs[0].role).toBe('editor');
      expect(collabs[0].status).toBe('accepted');
    });

    it('should create collaborator entries for multiple projects', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [
          { projectId: testProjectId, role: 'editor' },
          { projectId: testProject2Id, role: 'viewer' },
        ],
        issuer: 'http://localhost:8333',
      });

      const collabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, sessionId));
      expect(collabs).toHaveLength(2);

      const projectIds = collabs.map((c) => c.projectId).sort((a, b) => a.localeCompare(b));
      expect(projectIds).toEqual(
        [testProjectId, testProject2Id].sort((a, b) => a.localeCompare(b))
      );
    });

    it('should revoke previous sessions for the same user+client on relink', async () => {
      // First session - initial link
      const first = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'editor' }],
        issuer: 'http://localhost:8333',
      });

      // Verify first session is active
      let [firstSession] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, first.sessionId));
      expect(firstSession.revokedAt).toBeNull();

      // Second session - relink (same user + same client)
      const second = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'admin' }],
        issuer: 'http://localhost:8333',
      });

      // First session should now be revoked
      [firstSession] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, first.sessionId));
      expect(firstSession.revokedAt).not.toBeNull();
      expect(firstSession.revokedReason).toBe('Superseded by new session');

      // Second session should be active
      const [secondSession] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, second.sessionId));
      expect(secondSession.revokedAt).toBeNull();
    });

    it('should clean up old collaborator entries when revoking previous session', async () => {
      // First session
      const first = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [
          { projectId: testProjectId, role: 'editor' },
          { projectId: testProject2Id, role: 'viewer' },
        ],
        issuer: 'http://localhost:8333',
      });

      // Verify first session's collaborator entries exist
      let firstCollabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, first.sessionId));
      expect(firstCollabs).toHaveLength(2);

      // Second session (relink)
      const second = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'admin' }],
        issuer: 'http://localhost:8333',
      });

      // First session's collaborator entries should be cleaned up
      firstCollabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, first.sessionId));
      expect(firstCollabs).toHaveLength(0);

      // Second session's collaborator entries should exist
      const secondCollabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, second.sessionId));
      expect(secondCollabs).toHaveLength(1);
      expect(secondCollabs[0].role).toBe('admin');
    });

    it('should not revoke sessions from a different client', async () => {
      // Session with client 1
      const first = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'editor' }],
        issuer: 'http://localhost:8333',
      });

      // Session with client 2 (different agent)
      const second = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClient2Id,
        grants: [{ projectId: testProjectId, role: 'viewer' }],
        issuer: 'http://localhost:8333',
      });

      // Both sessions should be active
      const [firstSession] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, first.sessionId));
      expect(firstSession.revokedAt).toBeNull();

      const [secondSession] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, second.sessionId));
      expect(secondSession.revokedAt).toBeNull();

      // Both should have their collaborator entries
      const firstCollabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, first.sessionId));
      expect(firstCollabs).toHaveLength(1);

      const secondCollabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, second.sessionId));
      expect(secondCollabs).toHaveLength(1);
    });

    it('should handle multiple relinks cleanly (only latest session active)', async () => {
      // Link 1
      await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'viewer' }],
        issuer: 'http://localhost:8333',
      });

      // Link 2 (relink)
      await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'editor' }],
        issuer: 'http://localhost:8333',
      });

      // Link 3 (relink again)
      const third = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'admin' }],
        issuer: 'http://localhost:8333',
      });

      // Only the third session should be active
      const sessions = await db.select().from(mcpOAuthSessions);
      const activeSessions = sessions.filter((s) => s.revokedAt === null);
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].id).toBe(third.sessionId);

      // Only the third session should have collaborator entries
      const allCollabs = await db.select().from(projectCollaborators);
      expect(allCollabs).toHaveLength(1);
      expect(allCollabs[0].mcpSessionId).toBe(third.sessionId);
      expect(allCollabs[0].role).toBe('admin');
    });
  });

  describe('revokeSession', () => {
    it('should revoke a session and remove collaborator entries', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'editor' }],
        issuer: 'http://localhost:8333',
      });

      await mcpOAuthService.revokeSession(db, sessionId, 'User revoked');

      const [session] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, sessionId));
      expect(session.revokedAt).not.toBeNull();
      expect(session.revokedReason).toBe('User revoked');

      const collabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, sessionId));
      expect(collabs).toHaveLength(0);
    });
  });

  describe('getSessionGrants', () => {
    it('should return grants for a session', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [
          { projectId: testProjectId, role: 'editor' },
          { projectId: testProject2Id, role: 'viewer' },
        ],
        issuer: 'http://localhost:8333',
      });

      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants).toHaveLength(2);
      expect(grants.find((g) => g.projectId === testProjectId)?.role).toBe('editor');
      expect(grants.find((g) => g.projectId === testProject2Id)?.role).toBe('viewer');
    });
  });

  describe('grantProjectAccess', () => {
    it('should add a project to an existing session', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'editor' }],
        issuer: 'http://localhost:8333',
      });

      await mcpOAuthService.grantProjectAccess(db, sessionId, testProject2Id, 'viewer', testUserId);

      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants).toHaveLength(2);
    });
  });

  describe('revokeProjectAccess', () => {
    it('should remove a project from a session', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [
          { projectId: testProjectId, role: 'editor' },
          { projectId: testProject2Id, role: 'viewer' },
        ],
        issuer: 'http://localhost:8333',
      });

      await mcpOAuthService.revokeProjectAccess(db, sessionId, testProject2Id);

      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants).toHaveLength(1);
      expect(grants[0].projectId).toBe(testProjectId);
    });
  });

  describe('updateProjectRole', () => {
    it('should update the role for a project grant', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'viewer' }],
        issuer: 'http://localhost:8333',
      });

      await mcpOAuthService.updateProjectRole(db, sessionId, testProjectId, 'admin');

      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants[0].role).toBe('admin');
    });
  });

  describe('all-projects access', () => {
    it('should expand grants to all user projects at the default role', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [],
        accessAllProjects: true,
        defaultRole: 'editor',
        issuer: 'http://localhost:8333',
      });

      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants).toHaveLength(2);
      expect(grants.find((g) => g.projectId === testProjectId)?.role).toBe('editor');
      expect(grants.find((g) => g.projectId === testProject2Id)?.role).toBe('editor');
      expect(grants.every((g) => g.permissions.includes('write:elements'))).toBe(true);
    });

    it('should keep explicit per-project grants as overrides in all-projects mode', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'admin' }],
        accessAllProjects: true,
        defaultRole: 'viewer',
        issuer: 'http://localhost:8333',
      });

      // Explicit grants are persisted so they act as per-project overrides
      const collabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, sessionId));
      expect(collabs).toHaveLength(1);

      // Access is expanded to all projects; the explicit grant overrides the
      // default role for that project.
      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants).toHaveLength(2);
      expect(grants.find((g) => g.projectId === testProjectId)?.role).toBe('admin');
      expect(grants.find((g) => g.projectId === testProject2Id)?.role).toBe('viewer');
    });

    it('should honour explicit per-project grants as overrides', async () => {
      // Manually enable all-projects then add an explicit admin override.
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [],
        accessAllProjects: true,
        defaultRole: 'viewer',
        issuer: 'http://localhost:8333',
      });

      await mcpOAuthService.grantProjectAccess(db, sessionId, testProjectId, 'admin', testUserId);

      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants.find((g) => g.projectId === testProjectId)?.role).toBe('admin');
      expect(grants.find((g) => g.projectId === testProject2Id)?.role).toBe('viewer');
    });

    it('updateAllProjectsSettings should toggle all-projects and set default role', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'viewer' }],
        issuer: 'http://localhost:8333',
      });

      await mcpOAuthService.updateAllProjectsSettings(db, sessionId, true, 'admin');

      const grants = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grants).toHaveLength(2);
      // The explicit viewer grant on testProjectId remains as an override
      expect(grants.find((g) => g.projectId === testProjectId)?.role).toBe('viewer');
      expect(grants.find((g) => g.projectId === testProject2Id)?.role).toBe('admin');

      // Disabling restores per-project-only access
      await mcpOAuthService.updateAllProjectsSettings(db, sessionId, false);

      const grantsAfter = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(grantsAfter).toHaveLength(1);
      expect(grantsAfter[0].projectId).toBe(testProjectId);
    });
  });

  describe('session details (all-projects)', () => {
    it('getSessionDetails should expand grants for all-projects sessions', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [],
        accessAllProjects: true,
        defaultRole: 'editor',
        issuer: 'http://localhost:8333',
      });

      const details = await mcpOAuthService.getSessionDetails(db, sessionId, testUserId);
      expect(details).not.toBeNull();
      expect(details!.session.accessAllProjects).toBe(true);
      expect(details!.session.defaultRole).toBe('editor');
      expect(details!.session.projectCount).toBe(2);
      expect(details!.grants).toHaveLength(2);
    });

    it('revoking an all-projects session removes all grants even while accessAllProjects remains set', async () => {
      const { sessionId } = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [],
        accessAllProjects: true,
        defaultRole: 'viewer',
        issuer: 'http://localhost:8333',
      });

      // Sanity check: before revocation the grants are expanded.
      const before = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(before).toHaveLength(2);

      await mcpOAuthService.revokeSession(db, sessionId, 'Test revocation');

      // Revocation prevents expansion: no grants are returned.
      const after = await mcpOAuthService.getSessionGrants(db, sessionId);
      expect(after).toHaveLength(0);

      const [session] = await db
        .select()
        .from(mcpOAuthSessions)
        .where(eq(mcpOAuthSessions.id, sessionId));
      expect(session.revokedAt).not.toBeNull();
      expect(session.accessAllProjects).toBe(true);
    });
  });
});

// Helper: compute S256 PKCE challenge from a code verifier
async function computeCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCodePoint(b);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

describe('MCP OAuth Service - exchangeAuthorizationCode', () => {
  const codeVerifier = 'test-code-verifier-that-is-long-enough-for-pkce';
  let codeChallenge: string;

  beforeAll(async () => {
    codeChallenge = await computeCodeChallenge(codeVerifier);
  });

  it('should reject client ID mismatch', async () => {
    const code = await mcpOAuthService.createAuthorizationCode(db, {
      userId: testUserId,
      clientId: testClientId,
      redirectUri: 'http://localhost:3000/callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      grants: [{ projectId: testProjectId, role: 'editor' }],
    });

    await expect(
      mcpOAuthService.exchangeAuthorizationCode(db, {
        code,
        codeVerifier,
        clientId: testClient2Id, // different client
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'http://localhost:8333',
      })
    ).rejects.toThrow('Client ID mismatch');
  });

  it('should exchange code successfully with matching client ID (public client)', async () => {
    const code = await mcpOAuthService.createAuthorizationCode(db, {
      userId: testUserId,
      clientId: testClientId,
      redirectUri: 'http://localhost:3000/callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      grants: [{ projectId: testProjectId, role: 'editor' }],
    });

    const tokens = await mcpOAuthService.exchangeAuthorizationCode(db, {
      code,
      codeVerifier,
      clientId: testClientId,
      redirectUri: 'http://localhost:3000/callback',
      issuer: 'http://localhost:8333',
    });

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });

  it('should reject exchange when client is not found', async () => {
    const code = await mcpOAuthService.createAuthorizationCode(db, {
      userId: testUserId,
      clientId: testClientId,
      redirectUri: 'http://localhost:3000/callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      grants: [{ projectId: testProjectId, role: 'editor' }],
    });

    // Delete the client so lookupClient returns null
    const [deleted] = await db
      .delete(mcpOAuthClients)
      .where(eq(mcpOAuthClients.id, testClientId))
      .returning();

    await expect(
      mcpOAuthService.exchangeAuthorizationCode(db, {
        code,
        codeVerifier,
        clientId: testClientId,
        redirectUri: 'http://localhost:3000/callback',
        issuer: 'http://localhost:8333',
      })
    ).rejects.toThrow('Client not found');

    // Re-insert the client for subsequent tests
    await db.insert(mcpOAuthClients).values(deleted);
  });

  it('should require client_secret for confidential clients', async () => {
    const code = await mcpOAuthService.createAuthorizationCode(db, {
      userId: testUserId,
      clientId: testConfidentialClientId,
      redirectUri: 'http://localhost:5000/callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      grants: [{ projectId: testProjectId, role: 'editor' }],
    });

    await expect(
      mcpOAuthService.exchangeAuthorizationCode(db, {
        code,
        codeVerifier,
        clientId: testConfidentialClientId,
        redirectUri: 'http://localhost:5000/callback',
        issuer: 'http://localhost:8333',
        // no clientSecret provided
      })
    ).rejects.toThrow('client_secret is required for confidential clients');
  });

  it('should reject wrong client_secret for confidential clients', async () => {
    const code = await mcpOAuthService.createAuthorizationCode(db, {
      userId: testUserId,
      clientId: testConfidentialClientId,
      redirectUri: 'http://localhost:5000/callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      grants: [{ projectId: testProjectId, role: 'editor' }],
    });

    await expect(
      mcpOAuthService.exchangeAuthorizationCode(db, {
        code,
        codeVerifier,
        clientId: testConfidentialClientId,
        clientSecret: 'wrong-secret',
        redirectUri: 'http://localhost:5000/callback',
        issuer: 'http://localhost:8333',
      })
    ).rejects.toThrow('Invalid client_secret');
  });

  it('should accept correct client_secret for confidential clients', async () => {
    const code = await mcpOAuthService.createAuthorizationCode(db, {
      userId: testUserId,
      clientId: testConfidentialClientId,
      redirectUri: 'http://localhost:5000/callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      grants: [{ projectId: testProjectId, role: 'editor' }],
    });

    const tokens = await mcpOAuthService.exchangeAuthorizationCode(db, {
      code,
      codeVerifier,
      clientId: testConfidentialClientId,
      clientSecret: testConfidentialClientSecret,
      redirectUri: 'http://localhost:5000/callback',
      issuer: 'http://localhost:8333',
    });

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
  });
});

describe('OAuthError', () => {
  it('should serialize to JSON correctly', () => {
    const err = new OAuthError('invalid_request', 'Missing parameter');
    expect(err.toJSON()).toEqual({
      error: 'invalid_request',
      error_description: 'Missing parameter',
    });
  });

  it('should use default status 400', () => {
    const err = new OAuthError('server_error', 'Oops');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('OAuthError');
  });

  it('should accept custom status code', () => {
    const err = new OAuthError('access_denied', 'Forbidden', 403);
    expect(err.statusCode).toBe(403);
  });
});

describe('MCP OAuth Service - cleanup and utility methods', () => {
  it('cleanupExpiredCodes should delete expired codes', async () => {
    const expiredHash = 'expired-hash-' + Date.now();
    await db.insert(mcpOAuthCodes).values({
      codeHash: expiredHash,
      userId: testUserId,
      clientId: testClientId,
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost:3000/callback',
      grants: '[]',
      createdAt: Date.now() - 10_000,
      expiresAt: Date.now() - 5_000, // already expired
    });

    await mcpOAuthService.cleanupExpiredCodes(db);

    const remaining = await db
      .select()
      .from(mcpOAuthCodes)
      .where(eq(mcpOAuthCodes.codeHash, expiredHash));
    expect(remaining).toHaveLength(0);
  });

  it('cleanupExpiredSessions should delete expired sessions', async () => {
    const expiredSessionId = crypto.randomUUID();
    const now = Date.now();
    await db.insert(mcpOAuthSessions).values({
      id: expiredSessionId,
      userId: testUserId,
      clientId: testClientId,
      refreshTokenHash: 'expired-token-hash-' + now,
      createdAt: now - 100_000,
      lastUsedAt: now - 100_000,
      expiresAt: now - 50_000, // already expired
    });

    await mcpOAuthService.cleanupExpiredSessions(db);

    const remaining = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, expiredSessionId));
    expect(remaining).toHaveLength(0);
  });

  it('getPublicClient should return null for unknown client', async () => {
    const result = await mcpOAuthService.getPublicClient(db, 'nonexistent-client-id');
    expect(result).toBeNull();
  });

  it('getPublicClient should return public info for known client', async () => {
    const result = await mcpOAuthService.getPublicClient(db, testClientId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(testClientId);
  });

  it('getUserSessions should return active sessions for a user', async () => {
    const { sessionId } = await mcpOAuthService.createSession(db, {
      userId: testUserId,
      clientId: testClientId,
      grants: [{ projectId: testProjectId, role: 'viewer' }],
      issuer: 'http://localhost:8333',
    });

    const sessions = await mcpOAuthService.getUserSessions(db, testUserId);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const found = sessions.find((s) => s.id === sessionId);
    expect(found).toBeDefined();
    expect(found?.client.id).toBe(testClientId);
  });

  it('getSessionDetails should return null for unknown session', async () => {
    const result = await mcpOAuthService.getSessionDetails(db, 'nonexistent', testUserId);
    expect(result).toBeNull();
  });

  it('getSessionDetails should return session and grants for known session', async () => {
    const { sessionId } = await mcpOAuthService.createSession(db, {
      userId: testUserId,
      clientId: testClientId,
      grants: [{ projectId: testProjectId, role: 'editor' }],
      issuer: 'http://localhost:8333',
    });

    const result = await mcpOAuthService.getSessionDetails(db, sessionId, testUserId);
    expect(result).not.toBeNull();
    expect(result?.session.id).toBe(sessionId);
    expect(result?.grants.length).toBeGreaterThanOrEqual(1);
  });

  it('isSessionRevoked should return false for active session', async () => {
    const { sessionId } = await mcpOAuthService.createSession(db, {
      userId: testUserId,
      clientId: testClientId,
      grants: [],
      issuer: 'http://localhost:8333',
    });

    const revoked = await mcpOAuthService.isSessionRevoked(db, sessionId);
    expect(revoked).toBe(false);
  });

  it('isSessionRevoked should return true for revoked session', async () => {
    const { sessionId } = await mcpOAuthService.createSession(db, {
      userId: testUserId,
      clientId: testClientId,
      grants: [],
      issuer: 'http://localhost:8333',
    });

    await mcpOAuthService.revokeSession(db, sessionId);
    const revoked = await mcpOAuthService.isSessionRevoked(db, sessionId);
    expect(revoked).toBe(true);
  });

  it('isSessionRevoked should return true for nonexistent session', async () => {
    const revoked = await mcpOAuthService.isSessionRevoked(db, 'nonexistent-id');
    expect(revoked).toBe(true);
  });
});

describe('MCP OAuth Service - refresh token rotation', () => {
  const ISSUER = 'http://localhost:8333';

  async function freshSession() {
    return mcpOAuthService.createSession(db, {
      userId: testUserId,
      clientId: testClientId,
      grants: [{ projectId: testProjectId, role: 'editor' }],
      issuer: ISSUER,
    });
  }

  async function setPreviousExpiry(sessionId: string, previousTokenExpiresAt: number) {
    await db
      .update(mcpOAuthSessions)
      .set({ previousTokenExpiresAt })
      .where(eq(mcpOAuthSessions.id, sessionId));
  }

  it('rotates the refresh token and keeps the old one usable within the grace period', async () => {
    const { sessionId, tokens } = await freshSession();

    const rotated = await mcpOAuthService.refreshTokens(
      db,
      tokens.refreshToken,
      testClientId,
      undefined,
      ISSUER
    );
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    // Immediately re-presenting the superseded token (lost response) is
    // tolerated during the grace window.
    const again = await mcpOAuthService.refreshTokens(
      db,
      tokens.refreshToken,
      testClientId,
      undefined,
      ISSUER
    );
    expect(again.refreshToken).toBeDefined();

    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, sessionId));
    expect(session.revokedAt).toBeNull();
  });

  it('rejects the superseded token once the grace period has passed and revokes the session', async () => {
    const { sessionId, tokens } = await freshSession();
    const rotated = await mcpOAuthService.refreshTokens(
      db,
      tokens.refreshToken,
      testClientId,
      undefined,
      ISSUER
    );

    // Simulate the grace window elapsing.
    await setPreviousExpiry(sessionId, Date.now() - 1);

    await expect(
      mcpOAuthService.refreshTokens(db, tokens.refreshToken, testClientId, undefined, ISSUER)
    ).rejects.toThrow(OAuthError);

    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, sessionId));
    expect(session.revokedAt).not.toBeNull();
    expect(session.revokedReason).toBe('Refresh token reuse detected');

    // The current token no longer works either: the whole session is dead.
    await expect(
      mcpOAuthService.refreshTokens(db, rotated.refreshToken, testClientId, undefined, ISSUER)
    ).rejects.toThrow('Session has been revoked');
  });

  it('does not treat a legacy row with no grace deadline as an open-ended grace period', async () => {
    const { sessionId, tokens } = await freshSession();
    await mcpOAuthService.refreshTokens(db, tokens.refreshToken, testClientId, undefined, ISSUER);
    await db
      .update(mcpOAuthSessions)
      .set({ previousTokenExpiresAt: null })
      .where(eq(mcpOAuthSessions.id, sessionId));

    await expect(
      mcpOAuthService.refreshTokens(db, tokens.refreshToken, testClientId, undefined, ISSUER)
    ).rejects.toThrow('Invalid refresh token');
  });

  it('rejects an unknown refresh token without touching any session', async () => {
    const { sessionId } = await freshSession();
    await expect(
      mcpOAuthService.refreshTokens(db, 'iw_rt_not-a-real-token', testClientId, undefined, ISSUER)
    ).rejects.toThrow('Invalid refresh token');
    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, sessionId));
    expect(session.revokedAt).toBeNull();
  });
});

describe('MCP OAuth Service - an account ends its sessions', () => {
  const ISSUER = 'http://localhost:8333';
  const REDIRECT_URI = 'http://localhost:3000/callback';
  const CODE_VERIFIER = 'test-code-verifier-that-is-long-enough-for-pkce';

  let userId: string;

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  // Set on the row with nothing revoked, which is how an account looks if it
  // was disabled or reset before OAuth sessions took notice of it.
  const refusedAccounts: [string, () => Partial<typeof users.$inferInsert>][] = [
    ['disabled', () => ({ enabled: false })],
    ['no longer approved', () => ({ approved: false })],
    ['past its session watermark', () => ({ sessionsValidFrom: nowSeconds() + 60 })],
  ];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      username: `ended-${userId}`,
      email: `${userId}@example.com`,
      password: 'hash',
      approved: true,
      enabled: true,
      isAdmin: false,
    });
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  function link(clientId = testClientId, projectId = testProjectId) {
    return mcpOAuthService.createSession(db, {
      userId,
      clientId,
      grants: [{ projectId, role: 'editor' }],
      issuer: ISSUER,
    });
  }

  function refresh(refreshToken: string) {
    return mcpOAuthService.refreshTokens(db, refreshToken, testClientId, undefined, ISSUER);
  }

  async function storedSession(sessionId: string) {
    const [session] = await db
      .select()
      .from(mcpOAuthSessions)
      .where(eq(mcpOAuthSessions.id, sessionId));
    return session;
  }

  async function createCode() {
    return mcpOAuthService.createAuthorizationCode(db, {
      userId,
      clientId: testClientId,
      redirectUri: REDIRECT_URI,
      codeChallenge: await computeCodeChallenge(CODE_VERIFIER),
      codeChallengeMethod: 'S256',
      grants: [{ projectId: testProjectId, role: 'editor' }],
    });
  }

  function exchange(code: string) {
    return mcpOAuthService.exchangeAuthorizationCode(db, {
      code,
      codeVerifier: CODE_VERIFIER,
      clientId: testClientId,
      redirectUri: REDIRECT_URI,
      issuer: ISSUER,
    });
  }

  describe('checks the account each time', () => {
    it.each(refusedAccounts)('refuses a session when the account is %s', async (_, change) => {
      const { sessionId, tokens } = await link();
      await db.update(users).set(change()).where(eq(users.id, userId));

      expect(await mcpOAuthService.isSessionRevoked(db, sessionId)).toBe(true);
      await expect(refresh(tokens.refreshToken)).rejects.toThrow('Session has been revoked');
      // Refused before the rotation, so nothing about the session changed.
      expect((await storedSession(sessionId)).previousRefreshTokenHash).toBeNull();
    });

    it.each(refusedAccounts)(
      'refuses an authorization code when the account is %s',
      async (_, change) => {
        const code = await createCode();
        await db.update(users).set(change()).where(eq(users.id, userId));

        await expect(exchange(code)).rejects.toMatchObject({ code: 'invalid_grant' });

        const sessions = await db
          .select()
          .from(mcpOAuthSessions)
          .where(eq(mcpOAuthSessions.userId, userId));
        expect(sessions).toEqual([]);
      }
    );

    it('keeps a session made after the account last ended its sessions', async () => {
      await db
        .update(users)
        .set({ sessionsValidFrom: nowSeconds() - 60 })
        .where(eq(users.id, userId));

      const { sessionId, tokens } = await link();

      expect(await mcpOAuthService.isSessionRevoked(db, sessionId)).toBe(false);
      expect((await refresh(tokens.refreshToken)).accessToken).toBeDefined();
    });

    it('compares the watermark in seconds with a creation time in milliseconds', async () => {
      const { sessionId } = await link();
      const watermark = nowSeconds();
      await db.update(users).set({ sessionsValidFrom: watermark }).where(eq(users.id, userId));
      const createdAt = (ms: number) =>
        db
          .update(mcpOAuthSessions)
          .set({ createdAt: ms })
          .where(eq(mcpOAuthSessions.id, sessionId));

      await createdAt(watermark * 1000 - 1);
      expect(await mcpOAuthService.isSessionRevoked(db, sessionId)).toBe(true);

      // A login token issued within the watermark's second survives it too.
      await createdAt(watermark * 1000 + 500);
      expect(await mcpOAuthService.isSessionRevoked(db, sessionId)).toBe(false);
    });

    it('accepts an authorization code from an account in good standing', async () => {
      const tokens = await exchange(await createCode());
      expect(tokens.accessToken).toBeDefined();
    });
  });

  describe('revokes them when it happens', () => {
    const endings: [string, string, () => Promise<void>][] = [
      [
        'disabling the account',
        'Account disabled',
        () => userService.setUserEnabled(db, userId, false),
      ],
      ['rejecting the account', 'Account rejected', () => userService.rejectUser(db, userId)],
      [
        'a password reset',
        'Password changed',
        () => userService.updatePassword(db, userId, 'a-new-password'),
      ],
      [
        'a passkey recovery',
        'Sessions invalidated',
        () => userService.invalidateSessions(db, userId),
      ],
    ];

    it.each(endings)('%s', async (_, reason, end) => {
      const first = await link();
      const second = await link(testClient2Id, testProject2Id);
      const someoneElse = await mcpOAuthService.createSession(db, {
        userId: testUserId,
        clientId: testClientId,
        grants: [{ projectId: testProjectId, role: 'viewer' }],
        issuer: ISSUER,
      });
      // Being invited to a project is not something an agent was given.
      await db.insert(projectCollaborators).values({
        projectId: testProject2Id,
        userId,
        collaboratorType: 'user',
        role: 'editor',
        status: 'accepted',
        invitedAt: Date.now(),
      });

      await end();

      for (const { sessionId } of [first, second]) {
        const session = await storedSession(sessionId);
        expect(session.revokedAt).not.toBeNull();
        expect(session.revokedReason).toBe(reason);
      }
      // Authorized Apps shows the truth without waiting for the agent to call.
      expect(await mcpOAuthService.getUserSessions(db, userId)).toEqual([]);

      const rows = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.userId, userId));
      expect(rows.map((row) => row.collaboratorType)).toEqual(['user']);

      expect((await storedSession(someoneElse.sessionId)).revokedAt).toBeNull();
      expect(await mcpOAuthService.getSessionGrants(db, someoneElse.sessionId)).toHaveLength(1);
    });

    it('does not bring sessions back when the account is enabled again', async () => {
      const { sessionId, tokens } = await link();

      await userService.setUserEnabled(db, userId, false);
      await userService.setUserEnabled(db, userId, true);

      expect(await mcpOAuthService.isSessionRevoked(db, sessionId)).toBe(true);
      await expect(refresh(tokens.refreshToken)).rejects.toThrow('Session has been revoked');

      // Linking the agent again is all it takes.
      const relinked = await link();
      expect(await mcpOAuthService.isSessionRevoked(db, relinked.sessionId)).toBe(false);
    });

    it('cancels an authorization code from the same second', async () => {
      // The watermark is in whole seconds, so it would let this code through.
      setSystemTime(new Date(nowSeconds() * 1000 + 100));
      try {
        const code = await createCode();

        await userService.invalidateSessions(db, userId);

        await expect(exchange(code)).rejects.toMatchObject({ code: 'invalid_grant' });
      } finally {
        setSystemTime();
      }
    });

    it('leaves no grant behind if it fails part way, and can run again', async () => {
      const { sessionId } = await link();
      // Callers move the watermark first, so the session is refused by now.
      await db
        .update(users)
        .set({ sessionsValidFrom: nowSeconds() + 60 })
        .where(eq(users.id, userId));
      const failsToUpdate = new Proxy(db, {
        get: (target, key, receiver) =>
          key === 'update'
            ? () => {
                throw new Error('write failed');
              }
            : Reflect.get(target, key, receiver),
      });

      await expect(
        mcpOAuthService.revokeUserSessions(failsToUpdate, userId, 'Account disabled')
      ).rejects.toThrow('write failed');

      const grants = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.userId, userId));
      expect(grants).toEqual([]);
      expect(await mcpOAuthService.isSessionRevoked(db, sessionId)).toBe(true);

      await mcpOAuthService.revokeUserSessions(db, userId, 'Account disabled');

      expect((await storedSession(sessionId)).revokedReason).toBe('Account disabled');
    });

    it('leaves sessions alone when an enabled account is enabled', async () => {
      const { sessionId } = await link();

      await userService.setUserEnabled(db, userId, true);

      expect(await mcpOAuthService.isSessionRevoked(db, sessionId)).toBe(false);
    });
  });
});

describe('MCP OAuth Service - dynamic client cap', () => {
  const originalCap = process.env['MCP_MAX_DYNAMIC_CLIENTS'];
  const DAY = 24 * 60 * 60 * 1000;

  afterEach(async () => {
    if (originalCap === undefined) delete process.env['MCP_MAX_DYNAMIC_CLIENTS'];
    else process.env['MCP_MAX_DYNAMIC_CLIENTS'] = originalCap;
    // Remove clients added by these tests; the shared fixtures are not dynamic
    // registrations except the confidential one, which we keep.
    await db.delete(mcpOAuthClients).where(eq(mcpOAuthClients.clientName, 'cap-test-client'));
  });

  async function dynamicClientCount(): Promise<number> {
    return db.$count(mcpOAuthClients, eq(mcpOAuthClients.isDynamic, true));
  }

  async function seedDynamic(ageMs: number): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(mcpOAuthClients).values({
      id,
      clientName: 'cap-test-client',
      redirectUris: JSON.stringify(['http://localhost:9/cb']),
      clientType: 'public',
      isDynamic: true,
      createdAt: Date.now() - ageMs,
    });
    return id;
  }

  it('registers freely below the cap', async () => {
    process.env['MCP_MAX_DYNAMIC_CLIENTS'] = String((await dynamicClientCount()) + 2);
    const result = await mcpOAuthService.registerClient(db, {
      clientName: 'cap-test-client',
      redirectUris: ['http://localhost:9/cb'],
    });
    expect(result.clientId).toBeDefined();
  });

  it('prunes day-old dynamic clients with no session to make room', async () => {
    const stale = await seedDynamic(2 * DAY);
    const fresh = await seedDynamic(60_000);
    process.env['MCP_MAX_DYNAMIC_CLIENTS'] = String(await dynamicClientCount());

    const result = await mcpOAuthService.registerClient(db, {
      clientName: 'cap-test-client',
      redirectUris: ['http://localhost:9/cb'],
    });
    expect(result.clientId).toBeDefined();

    const remaining = (await db.select({ id: mcpOAuthClients.id }).from(mcpOAuthClients)).map(
      (r) => r.id
    );
    expect(remaining).not.toContain(stale);
    expect(remaining).toContain(fresh);
  });

  it('keeps day-old dynamic clients that hold a session', async () => {
    const used = await seedDynamic(2 * DAY);
    await mcpOAuthService.createSession(db, {
      userId: testUserId,
      clientId: used,
      grants: [{ projectId: testProjectId, role: 'viewer' }],
      issuer: 'http://localhost:8333',
    });
    // Cap equals the current count and nothing prunable remains → refused.
    process.env['MCP_MAX_DYNAMIC_CLIENTS'] = String(await dynamicClientCount());

    await expect(
      mcpOAuthService.registerClient(db, {
        clientName: 'cap-test-client',
        redirectUris: ['http://localhost:9/cb'],
      })
    ).rejects.toMatchObject({ code: 'temporarily_unavailable', statusCode: 503 });

    const remaining = (await db.select({ id: mcpOAuthClients.id }).from(mcpOAuthClients)).map(
      (r) => r.id
    );
    expect(remaining).toContain(used);
  });

  it('refuses at the cap when only fresh clients exist', async () => {
    await seedDynamic(1_000);
    process.env['MCP_MAX_DYNAMIC_CLIENTS'] = String(await dynamicClientCount());
    await expect(
      mcpOAuthService.registerClient(db, {
        clientName: 'cap-test-client',
        redirectUris: ['http://localhost:9/cb'],
      })
    ).rejects.toThrow(OAuthError);
  });
});
