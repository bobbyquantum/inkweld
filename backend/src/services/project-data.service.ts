/**
 * A project's server-side data outside the database: removing it and moving
 * it when the slug changes.
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
import { logger } from './logger.service';
import { getStorageService } from './storage.service';
import { yjsService } from './yjs.service';

const renameLog = logger.child('ProjectRename');

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
 * Order matters on Bun/Node: the LevelDB handle must be closed before the
 * directory that contains it is removed.
 */
export async function removeProjectData(
  c: Context<AppContext>,
  username: string,
  slug: string
): Promise<void> {
  await yjsService.destroyProject(username, slug);
  await getStorageService(c.get('storage')).deleteProjectDirectory(username, slug);
  await destroyProjectDurableObject(c, username, slug);
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
