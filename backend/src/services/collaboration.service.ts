/**
 * Collaboration Service
 *
 * Manages project collaborators - inviting, accepting, removing,
 * and checking access permissions for shared projects.
 */

import { eq, and, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import {
  projectCollaborators,
  type ProjectCollaborator,
  type InsertProjectCollaborator,
  type CollaboratorRole,
  type CollaboratorType,
  type InvitationStatus,
} from '../db/schema/project-collaborators';
import { projects } from '../db/schema/projects';
import { users } from '../db/schema/users';
import { mcpOAuthSessions } from '../db/schema/mcp-oauth-sessions';
import { mcpOAuthClients } from '../db/schema/mcp-oauth-clients';
import { projectService } from './project.service';
import { userService } from './user.service';
import { NotFoundError, BadRequestError } from '../errors';

/**
 * Collaborator with user details
 */
export interface CollaboratorWithUser extends ProjectCollaborator {
  username: string;
  name: string | null;
  email: string | null;
  invitedByUsername: string | null;
  /** 'user' for human collaborators, 'oauth_app' for AI/MCP apps */
  collaboratorType: CollaboratorType;
  /** OAuth client name (only set for oauth_app type) */
  clientName: string | null;
}

/**
 * Access level for a user on a project
 */
export interface ProjectAccess {
  isOwner: boolean;
  isCollaborator: boolean;
  role: CollaboratorRole | null;
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
}

class CollaborationService {
  /**
   * Get all collaborators for a project
   */
  async getCollaborators(db: DatabaseInstance, projectId: string): Promise<CollaboratorWithUser[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (db as any)
      .select({
        projectId: projectCollaborators.projectId,
        userId: projectCollaborators.userId,
        role: projectCollaborators.role,
        status: projectCollaborators.status,
        invitedBy: projectCollaborators.invitedBy,
        invitedAt: projectCollaborators.invitedAt,
        acceptedAt: projectCollaborators.acceptedAt,
        collaboratorType: projectCollaborators.collaboratorType,
        mcpSessionId: projectCollaborators.mcpSessionId,
        username: users.username,
        name: users.name,
        email: users.email,
      })
      .from(projectCollaborators)
      .leftJoin(users, eq(projectCollaborators.userId, users.id))
      .where(eq(projectCollaborators.projectId, projectId))
      .orderBy(desc(projectCollaborators.invitedAt));

    // Get OAuth client names for oauth_app entries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionIds: string[] = (results as any[])
      .filter((r) => r.mcpSessionId !== null)
      .map((r) => r.mcpSessionId as string)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const clientNameMap = new Map<string, string>();
    for (const sessionId of sessionIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [sessionWithClient] = await (db as any)
        .select({
          clientName: mcpOAuthClients.clientName,
        })
        .from(mcpOAuthSessions)
        .innerJoin(mcpOAuthClients, eq(mcpOAuthSessions.clientId, mcpOAuthClients.id))
        .where(eq(mcpOAuthSessions.id, sessionId))
        .limit(1);
      if (sessionWithClient?.clientName) {
        clientNameMap.set(sessionId, sessionWithClient.clientName);
      }
    }

    // Get inviter usernames in a second query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inviterIds: string[] = (results as any[])
      .filter((r) => r.invitedBy !== null)
      .map((r) => r.invitedBy as string)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const inviterMap = new Map<string, string>();
    if (inviterIds.length > 0) {
      for (const inviterId of inviterIds) {
        const inviter = await userService.findById(db, inviterId);
        if (inviter?.username) {
          inviterMap.set(inviterId, inviter.username);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      projectId: r.projectId as string,
      userId: r.userId as string,
      role: r.role as CollaboratorRole,
      status: r.status as InvitationStatus,
      invitedBy: r.invitedBy as string | null,
      invitedAt: r.invitedAt as number,
      acceptedAt: r.acceptedAt as number | null,
      username: r.username as string,
      name: r.name as string | null,
      email: r.email as string | null,
      invitedByUsername: r.invitedBy ? (inviterMap.get(r.invitedBy) ?? null) : null,
      collaboratorType: (r.collaboratorType as CollaboratorType) ?? 'user',
      clientName: r.mcpSessionId ? (clientNameMap.get(r.mcpSessionId) ?? null) : null,
    }));
  }

  /**
   * Get a specific human collaborator
   * Note: This only returns human collaborators (type='user'), not OAuth apps
   */
  async getCollaborator(
    db: DatabaseInstance,
    projectId: string,
    userId: string
  ): Promise<ProjectCollaborator | undefined> {
    const results = await db
      .select()
      .from(projectCollaborators)
      .where(
        and(
          eq(projectCollaborators.projectId, projectId),
          eq(projectCollaborators.userId, userId),
          eq(projectCollaborators.collaboratorType, 'user')
        )
      )
      .limit(1);

    return results[0];
  }

  /**
   * Invite a user to collaborate on a project
   */
  async inviteCollaborator(
    db: DatabaseInstance,
    projectId: string,
    targetUsername: string,
    role: CollaboratorRole,
    invitedByUserId: string
  ): Promise<CollaboratorWithUser> {
    // Find the target user
    const targetUser = await userService.findByUsername(db, targetUsername);
    if (!targetUser) {
      throw new NotFoundError(`User "${targetUsername}" not found`);
    }

    // Check if user is already a collaborator
    const existing = await this.getCollaborator(db, projectId, targetUser.id);
    if (existing) {
      throw new BadRequestError(`User "${targetUsername}" is already a collaborator`);
    }

    // Check if user is the project owner
    const project = await projectService.findById(db, projectId);
    if (project?.userId === targetUser.id) {
      throw new BadRequestError('Cannot invite the project owner');
    }

    // Create the invitation
    const newCollaborator: InsertProjectCollaborator = {
      projectId,
      userId: targetUser.id,
      collaboratorType: 'user',
      role,
      status: 'pending',
      invitedBy: invitedByUserId,
      invitedAt: Date.now(),
      acceptedAt: null,
    };

    await db.insert(projectCollaborators).values(newCollaborator);

    // Return the created collaborator with user info
    const collaborators = await this.getCollaborators(db, projectId);
    const created = collaborators.find((c) => c.userId === targetUser.id);
    if (!created) {
      throw new Error('Failed to create collaborator');
    }

    return created;
  }

  /**
   * Accept a collaboration invitation
   */
  async acceptInvitation(
    db: DatabaseInstance,
    projectId: string,
    userId: string
  ): Promise<CollaboratorWithUser> {
    const collaborator = await this.getCollaborator(db, projectId, userId);
    if (!collaborator) {
      throw new NotFoundError('Invitation not found');
    }

    if (collaborator.status !== 'pending') {
      throw new BadRequestError('Invitation has already been processed');
    }

    await db
      .update(projectCollaborators)
      .set({
        status: 'accepted',
        acceptedAt: Date.now(),
      })
      .where(
        and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, userId))
      );

    const collaborators = await this.getCollaborators(db, projectId);
    const updated = collaborators.find((c) => c.userId === userId);
    if (!updated) {
      throw new Error('Failed to update collaborator');
    }

    return updated;
  }

  /**
   * Decline a collaboration invitation
   */
  async declineInvitation(db: DatabaseInstance, projectId: string, userId: string): Promise<void> {
    const collaborator = await this.getCollaborator(db, projectId, userId);
    if (!collaborator) {
      throw new NotFoundError('Invitation not found');
    }

    if (collaborator.status !== 'pending') {
      throw new BadRequestError('Invitation has already been processed');
    }

    await db
      .update(projectCollaborators)
      .set({
        status: 'declined',
      })
      .where(
        and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, userId))
      );
  }

  /**
   * Update a collaborator's role
   */
  async updateRole(
    db: DatabaseInstance,
    projectId: string,
    userId: string,
    newRole: CollaboratorRole
  ): Promise<CollaboratorWithUser> {
    const collaborator = await this.getCollaborator(db, projectId, userId);
    if (!collaborator) {
      throw new NotFoundError('Collaborator not found');
    }

    await db
      .update(projectCollaborators)
      .set({ role: newRole })
      .where(
        and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, userId))
      );

    const collaborators = await this.getCollaborators(db, projectId);
    const updated = collaborators.find((c) => c.userId === userId);
    if (!updated) {
      throw new Error('Failed to update collaborator');
    }

    return updated;
  }

  /**
   * Remove a collaborator from a project
   */
  async removeCollaborator(db: DatabaseInstance, projectId: string, userId: string): Promise<void> {
    const collaborator = await this.getCollaborator(db, projectId, userId);
    if (!collaborator) {
      throw new NotFoundError('Collaborator not found');
    }

    await db
      .delete(projectCollaborators)
      .where(
        and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, userId))
      );
  }

  /**
   * Get pending invitations for a user
   */
  async getPendingInvitations(
    db: DatabaseInstance,
    userId: string
  ): Promise<
    Array<{
      projectId: string;
      projectTitle: string;
      projectSlug: string;
      ownerUsername: string;
      role: CollaboratorRole;
      invitedAt: number;
      invitedByUsername: string | null;
    }>
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (db as any)
      .select({
        projectId: projectCollaborators.projectId,
        role: projectCollaborators.role,
        invitedBy: projectCollaborators.invitedBy,
        invitedAt: projectCollaborators.invitedAt,
        projectTitle: projects.title,
        projectSlug: projects.slug,
        ownerId: projects.userId,
      })
      .from(projectCollaborators)
      .leftJoin(projects, eq(projectCollaborators.projectId, projects.id))
      .where(
        and(eq(projectCollaborators.userId, userId), eq(projectCollaborators.status, 'pending'))
      )
      .orderBy(desc(projectCollaborators.invitedAt));

    // Get owner and inviter usernames
    const userIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results.forEach((r: any) => {
      if (r.ownerId) userIds.add(r.ownerId);
      if (r.invitedBy) userIds.add(r.invitedBy);
    });

    const usernameMap = new Map<string, string>();
    for (const uid of userIds) {
      const user = await userService.findById(db, uid);
      if (user?.username) {
        usernameMap.set(uid, user.username);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      projectId: r.projectId as string,
      projectTitle: r.projectTitle as string,
      projectSlug: r.projectSlug as string,
      ownerUsername: usernameMap.get(r.ownerId) ?? 'unknown',
      role: r.role as CollaboratorRole,
      invitedAt: r.invitedAt as number,
      invitedByUsername: r.invitedBy ? (usernameMap.get(r.invitedBy) ?? null) : null,
    }));
  }

  /**
   * Get all projects a user has access to (as collaborator)
   */
  async getCollaboratedProjects(
    db: DatabaseInstance,
    userId: string
  ): Promise<
    Array<{
      projectId: string;
      projectTitle: string;
      projectSlug: string;
      ownerUsername: string;
      role: CollaboratorRole;
      acceptedAt: number;
    }>
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (db as any)
      .select({
        projectId: projectCollaborators.projectId,
        role: projectCollaborators.role,
        acceptedAt: projectCollaborators.acceptedAt,
        projectTitle: projects.title,
        projectSlug: projects.slug,
        ownerId: projects.userId,
      })
      .from(projectCollaborators)
      .leftJoin(projects, eq(projectCollaborators.projectId, projects.id))
      .where(
        and(eq(projectCollaborators.userId, userId), eq(projectCollaborators.status, 'accepted'))
      )
      .orderBy(desc(projectCollaborators.acceptedAt));

    // Get owner usernames
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerIds: string[] = (results as any[])
      .filter((r) => r.ownerId !== null)
      .map((r) => r.ownerId as string)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const usernameMap = new Map<string, string>();
    for (const ownerId of ownerIds) {
      const user = await userService.findById(db, ownerId);
      if (user?.username) {
        usernameMap.set(ownerId, user.username);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.map((r: any) => ({
      projectId: r.projectId as string,
      projectTitle: r.projectTitle as string,
      projectSlug: r.projectSlug as string,
      ownerUsername: usernameMap.get(r.ownerId) ?? 'unknown',
      role: r.role as CollaboratorRole,
      acceptedAt: r.acceptedAt as number,
    }));
  }

  /**
   * Check a user's access level for a project
   */
  async checkAccess(
    db: DatabaseInstance,
    projectId: string,
    userId: string | null | undefined
  ): Promise<ProjectAccess> {
    // No user = no access
    if (!userId) {
      return {
        isOwner: false,
        isCollaborator: false,
        role: null,
        canRead: false,
        canWrite: false,
        canAdmin: false,
      };
    }

    // Check if user is owner
    const project = await projectService.findById(db, projectId);
    if (!project) {
      return {
        isOwner: false,
        isCollaborator: false,
        role: null,
        canRead: false,
        canWrite: false,
        canAdmin: false,
      };
    }

    if (project.userId === userId) {
      return {
        isOwner: true,
        isCollaborator: false,
        role: null,
        canRead: true,
        canWrite: true,
        canAdmin: true,
      };
    }

    // Check if user is collaborator
    const collaborator = await this.getCollaborator(db, projectId, userId);
    if (!collaborator || collaborator.status !== 'accepted') {
      return {
        isOwner: false,
        isCollaborator: false,
        role: null,
        canRead: false,
        canWrite: false,
        canAdmin: false,
      };
    }

    const role = collaborator.role as CollaboratorRole;
    return {
      isOwner: false,
      isCollaborator: true,
      role,
      canRead: true, // All roles can read
      canWrite: role === 'editor' || role === 'admin',
      canAdmin: role === 'admin',
    };
  }

  /**
   * Get count of active collaborators for a project
   */
  async getCollaboratorCount(db: DatabaseInstance, projectId: string): Promise<number> {
    const results = await db
      .select()
      .from(projectCollaborators)
      .where(
        and(
          eq(projectCollaborators.projectId, projectId),
          eq(projectCollaborators.status, 'accepted')
        )
      );

    return results.length;
  }
}

export const collaborationService = new CollaborationService();
