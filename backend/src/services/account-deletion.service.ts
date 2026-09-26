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

export interface DeleteAccountOptions {
  /**
   * Also wipe each project's Durable Object (Workers only). The DO checks
   * that the bearer token belongs to the project owner, so this only works
   * when the request is made by the account being deleted.
   */
  destroyDurableObjects: boolean;
}

class AccountDeletionService {
  async deleteAccount(
    c: Context<AppContext>,
    user: User,
    options: DeleteAccountOptions
  ): Promise<void> {
    const db = c.get('db');
    const storage = getStorageService(c.get('storage'));
    const username = user.username;

    if (username) {
      // One project at a time, each fully removed (row included) before the
      // next: a failure part-way leaves the account in place with the
      // remaining projects intact, so the request can simply be retried.
      const owned = await projectService.findByUserId(db, user.id);
      for (const project of owned) {
        await yjsService.destroyProject(username, project.slug);
        await storage.deleteProjectDirectory(username, project.slug);
        if (options.destroyDurableObjects) {
          await destroyProjectDurableObject(c, username, project.slug);
        }
        await projectService.delete(db, project.id, user.id, project.slug);
      }

      // Profile images are keyed by username, so drop them while it is known.
      // An orphaned image is not a reason to block the deletion. Slot deletes
      // tolerate a missing image; the avatar delete does not, so it is only
      // attempted when one was uploaded.
      const cleanups: Array<[string, boolean, () => Promise<void>]> = [
        ['avatar', user.hasAvatar, () => storage.deleteUserAvatar(username)],
        ['banner', true, () => storage.deleteSlotImage('banners', username)],
        ['background', true, () => storage.deleteSlotImage('backgrounds', username)],
      ];
      for (const [what, present, cleanup] of cleanups) {
        if (!present) continue;
        try {
          await cleanup();
        } catch (error) {
          logger.warn('AccountDeletion', `Failed to delete user ${what}`, {
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    await userService.deleteUser(db, user.id);
    logger.info('AccountDeletion', 'Account deleted', { userId: user.id });
  }
}

export const accountDeletionService = new AccountDeletionService();
