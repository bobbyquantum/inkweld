/**
 * Yjs Worker Service
 *
 * A Cloudflare Workers compatible version of yjs.service.ts that accesses
 * Yjs documents via the YjsProject Durable Object's HTTP API.
 *
 * This is used by MCP tools when running on Cloudflare Workers,
 * where the normal yjsService (which uses LevelDB) cannot function.
 */

import type { DurableObjectNamespace, DurableObjectStub } from '../types/cloudflare';
import { Element } from '../schemas/element.schemas';
import { logger } from './logger.service';

const log = logger.child('YjsWorkerService');

/**
 * Minimal interface matching what MCP tools need from a Yjs document
 */
export interface WorkerYjsDocument {
  doc: {
    getMap: (name: string) => WorkerYMap;
    getArray: (name: string) => WorkerYArray;
    getXmlFragment: (name: string) => WorkerXmlFragment | undefined;
  };
}

interface WorkerYMap {
  forEach: (fn: (value: unknown, key: string) => void) => void;
  get: (key: string) => unknown;
  has: (key: string) => boolean;
}

interface WorkerYArray {
  forEach: (fn: (value: unknown, index: number) => void) => void;
  length: number;
}

interface WorkerXmlFragment {
  toString: () => string;
  length: number;
}

/**
 * Context needed to make DO calls
 */
export interface YjsWorkerContext {
  env: {
    YJS_PROJECTS: DurableObjectNamespace;
  };
  authToken: string;
}

/**
 * Helper to get the DO stub for a project
 */
function getDoStub(
  env: { YJS_PROJECTS: DurableObjectNamespace },
  username: string,
  slug: string
): DurableObjectStub {
  // Use the same ID generation logic as in yjs.routes.ts
  const projectKey = `${username}:${slug}`;
  const doId = env.YJS_PROJECTS.idFromName(projectKey);
  return env.YJS_PROJECTS.get(doId);
}

/**
 * Yjs Worker Service - calls Durable Object HTTP API for document access
 */
export class YjsWorkerService {
  private ctx: YjsWorkerContext;

  constructor(ctx: YjsWorkerContext) {
    this.ctx = ctx;
  }

  /**
   * Get elements for a project
   */
  async getElements(username: string, slug: string): Promise<Element[]> {
    const docId = `${username}:${slug}:elements`;
    const stub = getDoStub(this.ctx.env, username, slug);

    try {
      const response = await stub.fetch(
        new Request(`https://yjs-do/api/elements?documentId=${encodeURIComponent(docId)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.ctx.authToken}`,
          },
        })
      );
      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Failed to get elements: ${response.status} ${errorText}`);
        return [];
      }

      const text = await response.text();
      const data = JSON.parse(text) as { elements: Element[] };
      return data.elements || [];
    } catch (err) {
      log.error('Error getting elements from DO', err);
      return [];
    }
  }

  /**
   * Get a document - returns a wrapper that mimics the yjsService interface
   */
  async getDocument(docId: string): Promise<WorkerYjsDocument> {
    // Parse docId to get project
    const parts = docId.replace(/\/+$/, '').split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid docId format: ${docId}`);
    }

    const username = parts[0];
    const slug = parts[1];
    const stub = getDoStub(this.ctx.env, username, slug);

    try {
      const response = await stub.fetch(
        new Request(`https://yjs-do/api/document?documentId=${encodeURIComponent(docId)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.ctx.authToken}`,
          },
        })
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get document: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      // Create a wrapper that mimics the Y.Doc interface
      return this.createDocumentWrapper(data);
    } catch (err) {
      log.error('Error getting document from DO', err);
      // Return empty document wrapper
      return this.createDocumentWrapper({});
    }
  }

  /**
   * Apply updates to a document
   */
  async applyUpdates(
    docId: string,
    updates: Array<{ path: string; value: unknown }>
  ): Promise<void> {
    const parts = docId.replace(/\/+$/, '').split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid docId format: ${docId}`);
    }

    const username = parts[0];
    const slug = parts[1];
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/document?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update document: ${response.status} ${errorText}`);
    }
  }

  /**
   * Apply a raw Yjs update (base64-encoded) to a document via the DO HTTP API.
   * This is used for updating ProseMirror XmlFragment content, which cannot be
   * expressed as simple path-based updates.
   */
  async applyYjsUpdate(docId: string, base64Update: string): Promise<void> {
    const parts = docId.replace(/\/+$/, '').split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid docId format: ${docId}`);
    }

    const username = parts[0];
    const slug = parts[1];
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/document?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ yUpdate: base64Update }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to apply Yjs update: ${response.status} ${errorText}`);
    }
  }

  /**
   * Replace ProseMirror content in a document via the DO HTTP API.
   * Sends the XML string to the DO which handles the Yjs operations directly.
   */
  async updateProsemirrorContent(docId: string, xmlContent: string): Promise<void> {
    const parts = docId.replace(/\/+$/, '').split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid docId format: ${docId}`);
    }

    const username = parts[0];
    const slug = parts[1];
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/document?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prosemirrorXml: xmlContent }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update ProseMirror content: ${response.status} ${errorText}`);
    }
  }

  /**
   * Mutate the relationships Y.Array in a document via the DO HTTP API.
   * @param action 'replace' clears and sets all relationships, 'add' appends items
   */
  async mutateRelationships(
    docId: string,
    action: 'replace' | 'add',
    items: unknown[]
  ): Promise<void> {
    const parts = docId.replace(/\/+$/, '').split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid docId format: ${docId}`);
    }

    const username = parts[0];
    const slug = parts[1];
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/document?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relationships: { action, items } }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to mutate relationships: ${response.status} ${errorText}`);
    }
  }

  /**
   * Replace all elements in a project (via DO HTTP API)
   */
  async replaceAllElements(username: string, slug: string, elements: unknown[]): Promise<void> {
    const docId = `${username}:${slug}:elements`;
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/elements?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'replace_all', elements }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to replace elements: ${response.status} ${errorText}`);
    }
  }

  /**
   * Insert an element at a specific position
   */
  async insertElement(
    username: string,
    slug: string,
    element: unknown,
    position?: number
  ): Promise<void> {
    const docId = `${username}:${slug}:elements`;
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/elements?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'insert', element, position }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to insert element: ${response.status} ${errorText}`);
    }
  }

  /**
   * Update an element by ID
   */
  async updateElement(
    username: string,
    slug: string,
    elementId: string,
    element: unknown
  ): Promise<void> {
    const docId = `${username}:${slug}:elements`;
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/elements?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'update', elementId, element }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update element: ${response.status} ${errorText}`);
    }
  }

  /**
   * Delete an element by ID
   */
  async deleteElement(username: string, slug: string, elementId: string): Promise<void> {
    const docId = `${username}:${slug}:elements`;
    const stub = getDoStub(this.ctx.env, username, slug);

    const response = await stub.fetch(
      new Request(`https://yjs-do/api/elements?documentId=${encodeURIComponent(docId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ctx.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'delete', elementId }),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete element: ${response.status} ${errorText}`);
    }
  }

  /**
   * Create a wrapper around JSON data that mimics Y.Doc interface
   */
  private createDocumentWrapper(data: Record<string, unknown>): WorkerYjsDocument {
    return {
      doc: {
        getMap: (name: string): WorkerYMap => {
          const mapData = (data[name] as Record<string, unknown>) || {};
          return this.createMapWrapper(mapData);
        },
        getArray: (name: string): WorkerYArray => {
          const arrayData = (data[name] as unknown[]) || [];
          return this.createArrayWrapper(arrayData);
        },
        getXmlFragment: (name: string): WorkerXmlFragment | undefined => {
          // prosemirror content is serialized as string by the DO
          const xmlString = data[name] as string | undefined;
          if (!xmlString) return undefined;
          return this.createXmlFragmentWrapper(xmlString);
        },
      },
    };
  }

  /**
   * Create a Y.Map-like wrapper around plain object
   */
  private createMapWrapper(data: Record<string, unknown>): WorkerYMap {
    return {
      forEach: (fn: (value: unknown, key: string) => void): void => {
        for (const [key, value] of Object.entries(data)) {
          fn(value, key);
        }
      },
      get: (key: string): unknown => data[key],
      has: (key: string): boolean => key in data,
    };
  }

  /**
   * Create a Y.Array-like wrapper around plain array
   */
  private createArrayWrapper(data: unknown[]): WorkerYArray {
    return {
      forEach: (fn: (value: unknown, index: number) => void): void => {
        data.forEach((value, index) => fn(value, index));
      },
      length: data.length,
    };
  }

  /**
   * Create a Y.XmlFragment-like wrapper around XML string
   */
  private createXmlFragmentWrapper(xmlString: string): WorkerXmlFragment {
    return {
      toString: (): string => xmlString,
      length: xmlString.length > 0 ? 1 : 0, // Non-zero if has content
    };
  }
}

/**
 * Factory function to create the appropriate Yjs service based on runtime
 */
export function createYjsWorkerService(ctx: YjsWorkerContext): YjsWorkerService {
  return new YjsWorkerService(ctx);
}
