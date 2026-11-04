/**
 * A project's server-side data outside the database: removing it, moving it
 * when the slug changes, and checking that a slug's directory would be the
 * project's own.
 *
 * Every store keys a project by `username:slug`: the project directory (an R2
 * prefix on Workers) holds its media, covers and published files, and its Yjs
 * documents live in a LevelDB store inside that directory on Bun/Node, or in
 * a Durable Object named `username:slug` on Workers, under keys that carry the
 * slug too. A rename moves all of them and then commits the new slug to the
 * database. If any step fails before the commit lands, the steps already
 * taken are undone, newest first, so the project stays whole under its old
 * slug.
 */

import type { Context } from 'hono';
import { forEachSequential } from '@inkweld/async';
import type { AppContext } from '../types/context';
import {
  destroyProjectDurableObject,
  prepareProjectDurableObjectMove,
} from '../utils/project-durable-object';
import { isStorageSegment } from '../utils/storage-segment';
import { logger } from './logger.service';
import { projectService } from './project.service';
import { getStorageService } from './storage.service';
import { yjsService } from './yjs.service';

const renameLog = logger.child('ProjectRename');
const dataLog = logger.child('ProjectData');

interface RenameStep {
  name: string;
  run(): Promise<void>;
  /** Reverse a step that completed. Never called for the step that failed. */
  undo(): Promise<void>;
}

const nothingToUndo = (): Promise<void> => Promise.resolve();

/**
 * Remove everything stored for `username/slug` outside the database: its Yjs
 * documents, its project directory (or R2 prefix) and, on Workers, its
 * Durable Object. The Durable Object checks the caller's token against the
 * project's row, so call this while the row exists.
 *
 * Storage refuses a username or slug that can't be one segment of a path or
 * key ({@link isStorageSegment}); some accounts created before usernames had
 * a character rule have one. By default that fails the call. With
 * `skipUnstorableFiles` (deleting a project or an account) the files are left
 * in place instead, since their directory can't be told apart from other
 * accounts', and the rest is removed.
 *
 * Order matters on Bun/Node: the LevelDB handle must be closed before the
 * directory that contains it is removed.
 */
export async function removeProjectData(
  c: Context<AppContext>,
  username: string,
  slug: string,
  options: { skipUnstorableFiles?: boolean } = {}
): Promise<void> {
  await yjsService.destroyProject(username, slug);
  if (options.skipUnstorableFiles && !(isStorageSegment(username) && isStorageSegment(slug))) {
    dataLog.warn(`Leaving the files of ${username}/${slug} in place: storage can't address them`);
  } else {
    await getStorageService(c.get('storage')).deleteProjectDirectory(username, slug);
  }
  await destroyProjectDurableObject(c, username, slug);
}

/**
 * A username as a case-insensitive file system may compare it (the macOS and
 * Windows defaults): Unicode compatibility form, then letter case. It may
 * treat more names as one than a given file system does, which only refuses
 * more.
 */
function directoryNameKey(username: string): string {
  return username.normalize('NFKC').toUpperCase().toLowerCase();
}

/**
 * Whether `username`'s project `slug` would have the same project directory
 * as another account's project. On disk, usernames that differ only in letter
 * case or Unicode form can name one directory; new usernames can't differ
 * from existing ones only in case, but accounts created before that rule can.
 * R2 compares keys exactly, so there it never happens. `userId` owns
 * `username`.
 */
export async function sharesProjectDirectory(
  c: Context<AppContext>,
  userId: string,
  username: string,
  slug: string
): Promise<boolean> {
  if (c.get('storage')) return false;
  const owners = await projectService.findOtherOwnersOfSlug(c.get('db'), slug, userId);
  const key = directoryNameKey(username);
  return owners.some((owner) => directoryNameKey(owner) === key);
}

/**
 * Move `username/fromSlug`'s documents and files to `toSlug`, then run
 * `commit` (the database update). Throws the first failure after undoing the
 * completed steps.
 *
 * On Workers the Durable Object is copied first: that locks the old object,
 * so no edit can land there while the rest moves. The old object is wiped
 * only after the commit; until then it is what an undo falls back to.
 */
export async function moveProjectData(
  c: Context<AppContext>,
  username: string,
  fromSlug: string,
  toSlug: string,
  commit: () => Promise<void>
): Promise<void> {
  const storage = getStorageService(c.get('storage'));
  const durableObject = prepareProjectDurableObjectMove(c, username, fromSlug, toSlug);

  const files: RenameStep = {
    name: 'files',
    run: () => storage.moveProjectDirectory(username, fromSlug, toSlug),
    undo: () => storage.moveProjectDirectory(username, toSlug, fromSlug),
  };
  const steps: RenameStep[] = durableObject
    ? [
        {
          name: 'Durable Object',
          run: () => durableObject.copy(),
          undo: () => durableObject.abort(),
        },
        files,
      ]
    : [
        {
          // Closes the LevelDB store so its directory can move.
          name: 'open documents',
          run: () => yjsService.renameProject(username, fromSlug, toSlug),
          undo: nothingToUndo,
        },
        files,
        {
          name: 'documents',
          run: () =>
            yjsService.renameProjectDocuments({
              username,
              directorySlug: toSlug,
              fromSlug,
              toSlug,
            }),
          undo: () =>
            yjsService.renameProjectDocuments({
              username,
              directorySlug: toSlug,
              fromSlug: toSlug,
              toSlug: fromSlug,
            }),
        },
      ];
  steps.push({ name: 'database', run: commit, undo: nothingToUndo });

  const done: RenameStep[] = [];
  try {
    // In order: each step relies on the one before it.
    await forEachSequential(steps, async (step) => {
      await step.run();
      done.push(step);
    });
  } catch (error) {
    renameLog.error(`Renaming ${username}/${fromSlug} to ${toSlug} failed`, error);
    // Newest first, so each undo sees the state its step left behind.
    await forEachSequential(done.toReversed(), (step) =>
      step.undo().catch((undoError: unknown) => {
        renameLog.error(`Could not undo the ${step.name} step of renaming ${fromSlug}`, undoError);
      })
    );
    throw error;
  }

  if (durableObject) {
    // The rename is done; failing the request now would only mislead the
    // client. The stale copy is inert (no project has the old slug), but a
    // project later created under that slug would open with it, so say so.
    await durableObject.complete().catch((error: unknown) => {
      renameLog.error(
        `Renamed ${username}/${fromSlug} to ${toSlug} but could not wipe the old Durable Object`,
        error
      );
    });
  }
}
