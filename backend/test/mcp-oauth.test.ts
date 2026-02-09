import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { join } from 'path';
import * as schema from '../src/db/schema';
import { mcpOAuthService } from '../src/services/mcp-oauth.service';
import { mcpOAuthClients } from '../src/db/schema/mcp-oauth-clients';
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

beforeAll(async () => {
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });

  const migrationsFolder = join(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });

  // Create test user
  testUserId = crypto.randomUUID();
  await db.insert(users).values({
    id: testUserId,
    username: 'oauthtest',
    email: 'oauthtest@example.com',
    passwordHash: 'hash',
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
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clean up sessions and collaborators between tests
  await db.delete(projectCollaborators);
  await db.delete(mcpOAuthSessions);
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
      expect(collabs.length).toBe(1);
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
      expect(collabs.length).toBe(2);

      const projectIds = collabs.map((c) => c.projectId).sort();
      expect(projectIds).toEqual([testProjectId, testProject2Id].sort());
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
      expect(firstCollabs.length).toBe(2);

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
      expect(firstCollabs.length).toBe(0);

      // Second session's collaborator entries should exist
      const secondCollabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, second.sessionId));
      expect(secondCollabs.length).toBe(1);
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
      expect(firstCollabs.length).toBe(1);

      const secondCollabs = await db
        .select()
        .from(projectCollaborators)
        .where(eq(projectCollaborators.mcpSessionId, second.sessionId));
      expect(secondCollabs.length).toBe(1);
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
      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0].id).toBe(third.sessionId);

      // Only the third session should have collaborator entries
      const allCollabs = await db.select().from(projectCollaborators);
      expect(allCollabs.length).toBe(1);
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
      expect(collabs.length).toBe(0);
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
      expect(grants.length).toBe(2);
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
      expect(grants.length).toBe(2);
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
      expect(grants.length).toBe(1);
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
});
