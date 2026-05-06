/**
 * Runtime-aware Yjs Access Layer
 *
 * Provides a unified interface for accessing Yjs documents that works on both:
 * - Bun runtime: Uses LevelDB-based yjsService
 * - Cloudflare Workers: Uses Durable Object HTTP API via YjsWorkerService
 *
 * Runtime detection is based on the presence of ctx.env?.YJS_PROJECTS
 */

import type { McpContext } from '../mcp.types';
import { type Element } from '../../schemas/element.schemas';
import { parseXmlToYjsNodes } from '@inkweld/prosemirror/xml';
import { YjsWorkerService, type YjsWorkerContext } from '../../services/yjs-worker.service';

/**
 * Check if running on Cloudflare Workers (has DO bindings)
 */
export function isCloudflareWorkers(ctx: McpContext): boolean {
  return !!ctx.env?.YJS_PROJECTS;
}

/**
 * Get elements for a project (works on both runtimes)
 */
export async function getElements(
  ctx: McpContext,
  username: string,
  slug: string
): Promise<Element[]> {
  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    return workerService.getElements(username, slug);
  } else {
    // Bun: use LevelDB service (dynamic import to avoid loading y-leveldb on Workers)
    const { yjsService } = await import('../../services/yjs.service');
    const docId = `${username}:${slug}:elements/`;
    const sharedDoc = await yjsService.getDocument(docId);
    const elementsArray = sharedDoc.doc.getArray('elements');
    return elementsArray.toJSON() as Element[];
  }
}

/**
 * Replace all elements in a project (works on both runtimes)
 */
export async function replaceAllElements(
  ctx: McpContext,
  username: string,
  slug: string,
  elements: Element[]
): Promise<void> {
  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.replaceAllElements(username, slug, elements);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const docId = `${username}:${slug}:elements/`;
    const sharedDoc = await yjsService.getDocument(docId);
    const elementsArray = sharedDoc.doc.getArray('elements');
    sharedDoc.doc.transact(() => {
      elementsArray.delete(0, elementsArray.length);
      elementsArray.insert(0, elements);
    });
  }
}

/**
 * Get a worldbuilding document (works on both runtimes)
 * Returns a wrapper that provides Map-like access to the document data
 */
export interface WorldbuildingDoc {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  toJSON(): Record<string, unknown>;
}

export async function getWorldbuildingDoc(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string
): Promise<WorldbuildingDoc> {
  const docId = `${username}:${slug}:${elementId}/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    const wrapperDoc = await workerService.getDocument(docId);

    // The worker service returns a read-only wrapper, but we need write capability
    // For now, throw an error for write operations on Workers (not yet implemented)
    const data: Record<string, unknown> = {};
    const rootMap = wrapperDoc.doc.getMap('root');
    const identityMap = wrapperDoc.doc.getMap('identity');

    // Merge root and identity maps
    rootMap.forEach((value, key) => {
      data[key] = value;
    });
    identityMap.forEach((value, key) => {
      data[key] = value;
    });

    return {
      get: (key: string) => data[key],
      set: (_key: string, _value: unknown) => {
        throw new Error('Worldbuilding write not yet supported on Cloudflare Workers');
      },
      has: (key: string) => key in data,
      toJSON: () => ({ ...data }),
    };
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const rootMap = sharedDoc.doc.getMap('root');
    const identityMap = sharedDoc.doc.getMap('identity');

    return {
      get: (key: string) => {
        // Check identity first, then root
        if (identityMap.has(key)) return identityMap.get(key);
        return rootMap.get(key);
      },
      set: (key: string, value: unknown) => {
        // Set in identity map (standard location for worldbuilding)
        identityMap.set(key, value);
      },
      has: (key: string) => identityMap.has(key) || rootMap.has(key),
      toJSON: () => {
        const data: Record<string, unknown> = {};
        rootMap.forEach((v, k) => {
          data[k] = v;
        });
        identityMap.forEach((v, k) => {
          data[k] = v;
        });
        return data;
      },
    };
  }
}

/**
 * Update worldbuilding data (works on both runtimes)
 */
export async function updateWorldbuilding(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string,
  updates: Record<string, unknown>,
  mapName: 'worldbuilding' | 'identity' = 'worldbuilding'
): Promise<void> {
  const docId = `${username}:${slug}:${elementId}/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);

    // Convert updates to path-based format
    const pathPrefix = mapName === 'identity' ? 'identity.' : 'worldbuilding.';
    const pathUpdates = Object.entries(updates).map(([key, value]) => ({
      path: `${pathPrefix}${key}`,
      value,
    }));
    await workerService.applyUpdates(docId, pathUpdates);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const targetMap = sharedDoc.doc.getMap(mapName);

    sharedDoc.doc.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        targetMap.set(key, value);
      }
    });
  }
}

/**
 * Update document ProseMirror content (works on both runtimes)
 *
 * Replaces the content of a document's ProseMirror XmlFragment with new XML content.
 * Uses forward CRDT operations (delete + insert) within a Yjs transaction to ensure
 * proper sync with all connected clients.
 *
 * @param ctx - MCP context
 * @param username - Project owner username
 * @param slug - Project slug
 * @param elementId - Document element ID
 * @param xmlContent - ProseMirror XML string (e.g., "<paragraph>Hello world</paragraph>")
 */
export async function updateDocumentContent(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string,
  xmlContent: string
): Promise<void> {
  const docId = `${username}:${slug}:${elementId}/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: Send XML to the DO which handles
    // the Yjs XmlFragment operations directly
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.updateProsemirrorContent(docId, xmlContent);
  } else {
    // Bun: use LevelDB service for direct Yjs access
    const Y = await import('yjs');
    const parsedNodes = parseXmlToYjsNodes(Y, xmlContent);

    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const xmlFragment = sharedDoc.doc.getXmlFragment('prosemirror');

    // Apply as a single transaction (forward CRDT operations)
    sharedDoc.doc.transact(() => {
      // Clear existing content
      if (xmlFragment.length > 0) {
        xmlFragment.delete(0, xmlFragment.length);
      }
      // Insert new content
      if (parsedNodes.length > 0) {
        xmlFragment.insert(0, parsedNodes);
      }
    });
  }
}

/**
 * Relationship type stored in the relationships array
 */
export interface Relationship {
  id: string;
  sourceElementId: string;
  targetElementId: string;
  relationshipTypeId: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all relationships for a project (works on both runtimes)
 */
export async function getRelationships(
  ctx: McpContext,
  username: string,
  slug: string
): Promise<Relationship[]> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API to get document and read relationships array
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    const doc = await workerService.getDocument(docId);
    const relationshipsArray = doc.doc.getArray('relationships');
    const relationships: Relationship[] = [];
    relationshipsArray.forEach((value) => {
      if (value && typeof value === 'object') {
        relationships.push(value as Relationship);
      }
    });
    return relationships;
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');
    return relationshipsArray.toJSON() as Relationship[];
  }
}

/**
 * Replace all relationships in a project (works on both runtimes)
 */
export async function replaceAllRelationships(
  ctx: McpContext,
  username: string,
  slug: string,
  relationships: Relationship[]
): Promise<void> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.mutateRelationships(docId, 'replace', relationships);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');
    sharedDoc.doc.transact(() => {
      relationshipsArray.delete(0, relationshipsArray.length);
      relationshipsArray.insert(0, relationships);
    });
  }
}

/**
 * Add a relationship (works on both runtimes)
 */
export async function addRelationship(
  ctx: McpContext,
  username: string,
  slug: string,
  relationship: Relationship
): Promise<void> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.mutateRelationships(docId, 'add', [relationship]);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');
    sharedDoc.doc.transact(() => {
      relationshipsArray.push([relationship]);
    });
  }
}

/**
 * Update project metadata coverMediaId in the Yjs elements document (works on both runtimes).
 *
 * The frontend stores `coverMediaId` in the `projectMeta` Y.Map inside the elements doc
 * (`${username}:${slug}:elements/`). When MCP changes the cover, we must update this so
 * all connected clients immediately see the new cover.
 */
export async function updateProjectMetaCoverMediaId(
  ctx: McpContext,
  username: string,
  slug: string,
  coverMediaId: string
): Promise<void> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API with path-based updates
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<NonNullable<typeof ctx.env>['YJS_PROJECTS']> },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.applyUpdates(docId, [
      { path: 'projectMeta.coverMediaId', value: coverMediaId },
      { path: 'projectMeta.updatedAt', value: new Date().toISOString() },
    ]);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const metaMap = sharedDoc.doc.getMap<string>('projectMeta');
    sharedDoc.doc.transact(() => {
      metaMap.set('coverMediaId', coverMediaId);
      metaMap.set('updatedAt', new Date().toISOString());
    });
  }
}
