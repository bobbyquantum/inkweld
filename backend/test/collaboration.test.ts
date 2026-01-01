import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users, projects, projectCollaborators } from '../src/db/schema/index';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('Collaboration', () => {
  let ownerUserId: string;
  let ownerUsername: string;
  let collaboratorUserId: string;
  let collaboratorUsername: string;
  let ownerClient: TestClient;
  let collaboratorClient: TestClient;
  let testProject: { id: string; slug: string; title: string };

  beforeAll(async () => {
    // Start test server
    const { baseUrl } = await startTestServer();
    ownerClient = new TestClient(baseUrl);
    collaboratorClient = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, 'collab_owner'));
    await db.delete(users).where(eq(users.username, 'collab_member'));

    // Create project owner
    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    const [owner] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'collab_owner',
        email: 'collab_owner@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    ownerUserId = owner.id;
    ownerUsername = owner.username ?? 'collab_owner';

    // Create collaborator user
    const [collaborator] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: 'collab_member',
        email: 'collab_member@example.com',
        password: hashedPassword,
        approved: true,
        enabled: true,
      })
      .returning();

    collaboratorUserId = collaborator.id;
    collaboratorUsername = collaborator.username ?? 'collab_member';

    // Login both users
    await ownerClient.login('collab_owner', 'testpassword123');
    await collaboratorClient.login('collab_member', 'testpassword123');

    // Create a test project
    const { response, json } = await ownerClient.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'collab-test-project',
        title: 'Collaboration Test Project',
        description: 'Testing collaboration features',
      }),
    });

    expect(response.status).toBe(201);
    testProject = (await json()) as typeof testProject;
  });

  afterAll(async () => {
    const db = getDatabase();

    // Clean up in reverse order of dependencies
    await db
      .delete(projectCollaborators)
      .where(eq(projectCollaborators.projectId, testProject?.id ?? ''));
    await db.delete(projects).where(eq(projects.userId, ownerUserId));
    await db.delete(users).where(eq(users.id, ownerUserId));
    await db.delete(users).where(eq(users.id, collaboratorUserId));

    await stopTestServer();
  });

  describe('GET /api/v1/collaboration/:username/:slug/collaborators', () => {
    it('should return empty list initially', async () => {
      const { response, json } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`
      );

      expect(response.status).toBe(200);
      const data = (await json()) as unknown[];
      expect(data).toBeArray();
      expect(data.length).toBe(0);
    });

    it('should deny access to non-owners', async () => {
      const { response } = await collaboratorClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`
      );

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/collaboration/:username/:slug/collaborators', () => {
    it('should invite a collaborator', async () => {
      const { response, json } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: collaboratorUsername,
            role: 'editor',
          }),
        }
      );

      expect(response.status).toBe(201);
      const data = (await json()) as {
        projectId: string;
        userId: string;
        role: string;
        status: string;
      };
      expect(data.projectId).toBe(testProject.id);
      expect(data.userId).toBe(collaboratorUserId);
      expect(data.role).toBe('editor');
      expect(data.status).toBe('pending');
    });

    it('should not allow duplicate invitations', async () => {
      const { response } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: collaboratorUsername,
            role: 'editor',
          }),
        }
      );

      // Service returns 400 for already invited users
      expect(response.status).toBe(400);
    });

    it('should not allow inviting the owner', async () => {
      const { response } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: ownerUsername,
            role: 'editor',
          }),
        }
      );

      expect(response.status).toBe(400);
    });

    it('should not allow non-owners to invite', async () => {
      const { response } = await collaboratorClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'some_other_user',
            role: 'viewer',
          }),
        }
      );

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/collaboration/invitations', () => {
    it('should return pending invitations for collaborator', async () => {
      const { response, json } = await collaboratorClient.request(
        '/api/v1/collaboration/invitations'
      );

      expect(response.status).toBe(200);
      const data = (await json()) as unknown[];
      expect(data).toBeArray();
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/v1/collaboration/invitations/:projectId/accept', () => {
    it('should accept an invitation', async () => {
      const { response } = await collaboratorClient.request(
        `/api/v1/collaboration/invitations/${testProject.id}/accept`,
        {
          method: 'POST',
        }
      );

      expect(response.status).toBe(200);

      // Verify the invitation is now accepted
      const db = getDatabase();
      const [collab] = await db
        .select()
        .from(projectCollaborators)
        .where(
          and(
            eq(projectCollaborators.projectId, testProject.id),
            eq(projectCollaborators.userId, collaboratorUserId)
          )
        );

      expect(collab.status).toBe('accepted');
    });
  });

  describe('Collaborator access', () => {
    it('should allow collaborator to access project', async () => {
      const { response, json } = await collaboratorClient.request(
        `/api/v1/projects/${ownerUsername}/${testProject.slug}`
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { title: string };
      expect(data.title).toBe(testProject.title);
    });
  });

  describe('GET /api/v1/collaboration/:username/:slug/collaborators (after acceptance)', () => {
    it('should list collaborators after acceptance', async () => {
      const { response, json } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { username: string; status: string }[];
      expect(data.length).toBe(1);
      expect(data[0].username).toBe(collaboratorUsername);
      expect(data[0].status).toBe('accepted');
    });

    it('should not allow regular collaborator to view collaborators list initially', async () => {
      // Regular collaborators (editor role) cannot view the full list - only admins
      // Note: The collaborator currently has editor role
      const { response } = await collaboratorClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators`
      );

      // Non-admin collaborators get 403
      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/collaboration/:username/:slug/collaborators/:userId', () => {
    it('should update collaborator role', async () => {
      const { response, json } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators/${collaboratorUserId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'admin',
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { role: string };
      expect(data.role).toBe('admin');
    });

    it('should deny admin collaborator from updating roles', async () => {
      // Only project owners can change roles, not admin collaborators
      // The previous test promoted this collaborator to admin
      const { response, json } = await collaboratorClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators/${collaboratorUserId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'viewer',
          }),
        }
      );

      // Admin collaborators should be denied - only owner can change roles
      expect(response.status).toBe(403);
      const data = (await json()) as { error: string; message: string };
      expect(data.message).toContain('owner');
    });

    it('should allow owner to demote admin collaborator', async () => {
      // Owner can change the role back to viewer
      const { response, json } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators/${collaboratorUserId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'viewer',
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { role: string };
      expect(data.role).toBe('viewer');
    });
  });

  describe('GET /api/v1/collaboration/collaborated', () => {
    it('should list projects the user collaborates on', async () => {
      const { response, json } = await collaboratorClient.request(
        '/api/v1/collaboration/collaborated'
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { projectId: string }[];
      expect(data).toBeArray();
      expect(data.some((p) => p.projectId === testProject.id)).toBe(true);
    });
  });

  describe('DELETE /api/v1/collaboration/:username/:slug/collaborators/:userId', () => {
    it('should remove a collaborator', async () => {
      const { response } = await ownerClient.request(
        `/api/v1/collaboration/${ownerUsername}/${testProject.slug}/collaborators/${collaboratorUserId}`,
        {
          method: 'DELETE',
        }
      );

      // Route returns 200 with a message
      expect(response.status).toBe(200);

      // Verify the collaborator is removed
      const db = getDatabase();
      const collabs = await db
        .select()
        .from(projectCollaborators)
        .where(
          and(
            eq(projectCollaborators.projectId, testProject.id),
            eq(projectCollaborators.userId, collaboratorUserId)
          )
        );

      expect(collabs.length).toBe(0);
    });

    it('should deny project access after removal', async () => {
      const { response } = await collaboratorClient.request(
        `/api/v1/projects/${ownerUsername}/${testProject.slug}`
      );

      // Project is private, so non-owner non-collaborator should get 403 or 404
      expect(response.status).toBeOneOf([403, 404]);
    });
  });
});
