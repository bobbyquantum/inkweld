import { inject, Injectable } from '@angular/core';
import { yjsStateDigest } from '@utils/yjs-state-digest';
import * as Y from 'yjs';

import { LoggerService } from '../core/logger.service';
import {
  type ServerConfig,
  StorageContextService,
} from '../core/storage-context.service';

/** localStorage flag recording that the prose document pass has completed */
export const DOCUMENT_STORAGE_MIGRATION_KEY =
  'inkweld-document-storage-migrated';

/** localStorage flag recording that the worldbuilding pass has completed */
export const WORLDBUILDING_STORAGE_MIGRATION_KEY =
  'inkweld-worldbuilding-storage-migrated';

/** Web Lock that keeps two tabs from migrating the same databases at once */
const MIGRATION_LOCK = 'inkweld-document-storage-migration';

/** A Yjs database written before names were profile-scoped */
export interface LegacyDocumentDb {
  name: string;
  username: string;
  slug: string;
  elementId: string;
}

export interface DocumentStorageMigrationResult {
  /** Legacy databases copied, verified and removed */
  migrated: number;
  /** Legacy databases no profile claims; left in place */
  unclaimed: number;
  /** Legacy databases whose copy failed or did not verify; left in place */
  failed: number;
}

/** The kinds of database the migration moves, each with its own flag */
export type LegacyStorageKind = 'documents' | 'worldbuilding';

/** Per-kind results; a kind is absent when its pass had already completed */
export type StorageMigrationResults = Partial<
  Record<LegacyStorageKind, DocumentStorageMigrationResult>
>;

/**
 * Parse a bare `username:slug:elementId` database name, the layout prose
 * documents used before they were stored under a profile prefix. Prefixed
 * names always have more than three parts (`local:u:s:e`,
 * `srv:<hash>:u:s:e`), worldbuilding docs have four, and the elements doc is
 * not a prose document, so none of those match.
 */
export function parseLegacyDocumentDbName(
  name: string
): LegacyDocumentDb | null {
  const parts = name.split(':');
  if (parts.length !== 3 || parts.some(part => part.trim() === '')) {
    return null;
  }
  const [username, slug, elementId] = parts;
  if (elementId === 'elements' || elementId === 'elements/') return null;
  return { name, username, slug, elementId };
}

/**
 * Parse a bare `worldbuilding:username:slug:elementId` database name, the
 * layout worldbuilding docs used before they were stored under a profile
 * prefix. Prefixed names (`local:worldbuilding:u:s:e`,
 * `srv:<hash>:worldbuilding:u:s:e`) have more parts, so they never match.
 */
export function parseLegacyWorldbuildingDbName(
  name: string
): LegacyDocumentDb | null {
  const parts = name.split(':');
  if (
    parts.length !== 4 ||
    parts[0] !== 'worldbuilding' ||
    parts.some(part => part.trim() === '')
  ) {
    return null;
  }
  const [, username, slug, elementId] = parts;
  return { name, username, slug, elementId };
}

interface MigrationPass {
  /** localStorage flag set once the pass has completed */
  flag: string;
  /** Recognises a legacy database of this kind */
  parse: (name: string) => LegacyDocumentDb | null;
}

const PASSES: Record<LegacyStorageKind, MigrationPass> = {
  documents: {
    flag: DOCUMENT_STORAGE_MIGRATION_KEY,
    parse: parseLegacyDocumentDbName,
  },
  worldbuilding: {
    flag: WORLDBUILDING_STORAGE_MIGRATION_KEY,
    parse: parseLegacyWorldbuildingDbName,
  },
};

/**
 * One-time move of Yjs databases from their bare name to the profile-scoped
 * `<prefix><name>` name, in two passes with their own completion flags:
 * prose documents (`username:slug:elementId`) and worldbuilding docs
 * (`worldbuilding:username:slug:elementId`).
 *
 * Older builds stored every profile's copy of a document in one database, so
 * two profiles with the same username and project slug (the same username on
 * two servers, or a server profile plus Browser mode) shared it. A legacy
 * database is therefore copied into *every* profile on this device that has
 * the project — each gets exactly what it saw before — and the original is
 * deleted only after every copy has been re-read and verified to contain it.
 * A database no profile claims is left alone rather than guessed at.
 *
 * The WebSocket document id is unchanged; only local IndexedDB names move.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentStorageMigrationService {
  private readonly storageContext = inject(StorageContextService);
  private readonly logger = inject(LoggerService);

  /**
   * Run every pass that has not yet completed on this device. Returns null
   * when nothing ran. Never rejects: a failure leaves the legacy database in
   * place and its pass runs again on the next start.
   */
  async migrateIfNeeded(): Promise<StorageMigrationResults | null> {
    try {
      const pending = this.pendingKinds();
      if (pending.length === 0) return null;
      // Nothing to migrate into yet; wait until a profile exists
      if (this.storageContext.getConfigurations().length === 0) return null;
      if (!('databases' in indexedDB)) {
        this.logger.warn(
          'DocumentStorageMigration',
          'indexedDB.databases() is unavailable; cannot find legacy documents'
        );
        return null;
      }
      return await this.withLock(async () => {
        const results: StorageMigrationResults = {};
        for (const kind of pending) results[kind] = await this.migrate(kind);
        return results;
      });
    } catch (error) {
      this.logger.error(
        'DocumentStorageMigration',
        'Document storage migration failed',
        error
      );
      return null;
    }
  }

  /** Migrate every legacy database of one kind on this device. */
  async migrate(
    kind: LegacyStorageKind = 'documents'
  ): Promise<DocumentStorageMigrationResult> {
    const pass = PASSES[kind];
    const result: DocumentStorageMigrationResult = {
      migrated: 0,
      unclaimed: 0,
      failed: 0,
    };
    // Re-check under the lock: another tab may have finished meanwhile
    if (localStorage.getItem(pass.flag)) return result;

    const names = (await indexedDB.databases())
      .map(db => db.name)
      .filter((name): name is string => !!name);
    const existing = new Set(names);
    const configs = this.storageContext.getConfigurations();

    for (const name of names) {
      const legacy = pass.parse(name);
      if (!legacy) continue;
      const prefixes = configs
        .filter(config => this.claims(config, legacy, existing))
        .map(config => this.storageContext.getPrefixForConfig(config.id));
      if (prefixes.length === 0) {
        result.unclaimed++;
        this.logger.warn(
          'DocumentStorageMigration',
          `No profile has project ${legacy.username}/${legacy.slug}; leaving ${name} in place`
        );
        continue;
      }
      try {
        await this.migrateDatabase(name, prefixes);
        result.migrated++;
      } catch (error) {
        result.failed++;
        this.logger.error(
          'DocumentStorageMigration',
          `Failed to migrate ${name}; keeping the original`,
          error
        );
      }
    }

    // Unclaimed databases do not hold the flag back on purpose. One no
    // profile claims now most likely belonged to a profile since removed;
    // retrying would let a profile added later (say, the same username on
    // another server) claim it and push those edits to its own server —
    // the cross-profile mixing this migration exists to end.
    if (result.failed === 0) {
      localStorage.setItem(pass.flag, new Date().toISOString());
    }
    this.logger.info(
      'DocumentStorageMigration',
      `Migrated ${result.migrated} ${kind} database(s); ${result.unclaimed} unclaimed, ${result.failed} failed`
    );
    return result;
  }

  private pendingKinds(): LegacyStorageKind[] {
    return (Object.keys(PASSES) as LegacyStorageKind[]).filter(
      kind => !localStorage.getItem(PASSES[kind].flag)
    );
  }

  /**
   * Copy one legacy database into `<prefix><name>` for each prefix, verify
   * each copy, then delete the original. Throws (keeping the original) if
   * any copy does not verify.
   */
  async migrateDatabase(name: string, prefixes: string[]): Promise<void> {
    const update = await this.readUpdate(name);
    for (const prefix of prefixes) {
      const target = `${prefix}${name}`;
      await this.mergeInto(target, update);
      if (!(await this.contains(target, update))) {
        throw new Error(`Copy of ${name} into ${target} did not verify`);
      }
    }
    await deleteDatabase(name);
    const targets = prefixes.map(prefix => prefix + name).join(', ');
    this.logger.debug(
      'DocumentStorageMigration',
      `Moved ${name} into ${targets}`
    );
  }

  /**
   * Whether a profile has the document's project on this device: its
   * elements database exists, or the project is in its project list.
   */
  private claims(
    config: ServerConfig,
    legacy: LegacyDocumentDb,
    existing: Set<string>
  ): boolean {
    const prefix = this.storageContext.getPrefixForConfig(config.id);
    if (existing.has(`${prefix}${legacy.username}:${legacy.slug}:elements`)) {
      return true;
    }
    return this.storageContext
      .listProjectsForContext(config.id)
      .some(p => p.username === legacy.username && p.slug === legacy.slug);
  }

  /**
   * The whole persisted state of a y-indexeddb database as one Yjs update.
   * Reads the `updates` store directly rather than through y-indexeddb, so
   * the copy is byte-for-byte what is stored and nothing is written back.
   */
  private async readUpdate(name: string): Promise<Uint8Array> {
    const db = await openYDatabase(name);
    try {
      const updates = await new Promise<Uint8Array[]>((resolve, reject) => {
        const request = db
          .transaction(UPDATES_STORE, 'readonly')
          .objectStore(UPDATES_STORE)
          .getAll();
        request.onsuccess = () => resolve(request.result as Uint8Array[]);
        request.onerror = () =>
          reject(request.error ?? new Error(`Failed to read ${name}`));
      });
      return Y.mergeUpdates(updates);
    } finally {
      db.close();
    }
  }

  /**
   * Append `update` to a y-indexeddb database, creating it with
   * y-indexeddb's schema if needed. Yjs updates are idempotent, so a target
   * left by an interrupted earlier run (or edited since) keeps its content.
   */
  private async mergeInto(target: string, update: Uint8Array): Promise<void> {
    const db = await openYDatabase(target);
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(UPDATES_STORE, 'readwrite');
        tx.objectStore(UPDATES_STORE).add(update);
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(tx.error ?? new Error(`Failed to write ${target}`));
        tx.onabort = () =>
          reject(tx.error ?? new Error(`Write to ${target} aborted`));
      });
    } finally {
      db.close();
    }
  }

  /**
   * Re-read `target` and check that applying `update` to it changes nothing
   * — i.e. every insert and delete in the source is there.
   */
  private async contains(target: string, update: Uint8Array): Promise<boolean> {
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, await this.readUpdate(target));
      const before = yjsStateDigest(doc);
      Y.applyUpdate(doc, update);
      return yjsStateDigest(doc) === before;
    } finally {
      doc.destroy();
    }
  }

  private withLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    if (!locks) return task();
    return locks.request(MIGRATION_LOCK, task);
  }
}

/** Object stores y-indexeddb creates in every document database */
const UPDATES_STORE = 'updates';
const CUSTOM_STORE = 'custom';

/** Open (or create) a database with y-indexeddb's schema */
function openYDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(UPDATES_STORE)) {
        db.createObjectStore(UPDATES_STORE, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CUSTOM_STORE)) {
        db.createObjectStore(CUSTOM_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(UPDATES_STORE)) {
        db.close();
        reject(new Error(`${name} is not a Yjs document database`));
        return;
      }
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to open ${name}`));
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to delete ${name}`));
    // Another tab holds it open; the delete completes once it closes
    request.onblocked = () => resolve();
  });
}
