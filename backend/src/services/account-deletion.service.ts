/**
 * Permanently delete a user account and everything it owns.
 *
 * Shared by the self-service `DELETE /api/v1/users/me` (required for Google
 * Play: an app that lets people create an account must let them delete it)
 * and the admin "Delete user" action.
 *
 * Removing the `users` row cascades every table that references it (projects,
 * passkeys, collaborator grants, comments, sessions, MCP keys, …), but a
 * project's content lives outside the database — LevelDB/Yjs documents, media
 * and published files on disk or in R2, and a Durable Object on Workers — so
 * each owned project is torn down exactly like `DELETE /projects/:u/:s` first.
 */

import type { Context } from 'hono';
import type { User } from '../db/schema';
import type { AppContext } from '../types/context';
import { destroyProjectDurableObject } from '../utils/project-durable-object';
import { logger } from './logger.service';
import { projectService } from './project.service';
import { getStorageService } from './storage.service';
import { userService } from './user.service';
import { yjsService } from './yjs.service';

export type DeleteAccountResult = 'deleted' | 'last-admin';

class AccountDeletionService {
  /**
   * Returns 'last-admin' (and deletes nothing) when the account is the only
   * active administrator. On Workers each project's Durable Object is wiped
   * with the caller's token, which the DO accepts from the owner or a site
   * admin.
   */
  async deleteAccount(c: Context<AppContext>, user: User): Promise<DeleteAccountResult> {
    const db = c.get('db');
    if (!(await userService.reserveForDeletion(db, user.id))) {
      return 'last-admin';
    }

    try {
      const username = user.username;
      if (username) {
        await this.deleteOwnedProjects(c, user.id, username);
        await this.deleteProfileImages(c, username, user.hasAvatar);
      }
      await userService.deleteUser(db, user.id);
    } catch (error) {
      // Leave the account usable so the deletion can be retried; projects
      // already removed stay removed.
      await userService.releaseDeletionReservation(db, user.id, user.isAdmin);
      throw error;
    }

    logger.info('AccountDeletion', 'Account deleted', { userId: user.id });
    return 'deleted';
  }

  /**
   * One project at a time, each fully removed (row included) before the
   * next: a failure part-way leaves the account in place with the remaining
   * projects intact, so the request can simply be retried.
   */
  private async deleteOwnedProjects(
    c: Context<AppContext>,
    userId: string,
    username: string
  ): Promise<void> {
    const db = c.get('db');
    const storage = getStorageService(c.get('storage'));
    const owned = await projectService.findByUserId(db, userId);
    for (const project of owned) {
      await yjsService.destroyProject(username, project.slug);
      await storage.deleteProjectDirectory(username, project.slug);
      await destroyProjectDurableObject(c, username, project.slug);
      await projectService.delete(db, project.id, userId, project.slug);
    }
  }

  /**
   * Profile images are keyed by username, so drop them while it is known.
   * An orphaned image is not a reason to block the deletion. Slot deletes
   * tolerate a missing image; the avatar delete does not, so it is only
   * attempted when one was uploaded.
   */
  private async deleteProfileImages(
    c: Context<AppContext>,
    username: string,
    hasAvatar: boolean
  ): Promise<void> {
    const storage = getStorageService(c.get('storage'));
    const cleanups: Array<[string, () => Promise<void>]> = [
      ['banner', () => storage.deleteSlotImage('banners', username)],
      ['background', () => storage.deleteSlotImage('backgrounds', username)],
    ];
    if (hasAvatar) {
      cleanups.unshift(['avatar', () => storage.deleteUserAvatar(username)]);
    }
    for (const [what, cleanup] of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        logger.warn('AccountDeletion', `Failed to delete user ${what}`, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const accountDeletionService = new AccountDeletionService();
