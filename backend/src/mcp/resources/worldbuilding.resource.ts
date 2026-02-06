/**
 * MCP Resources: Worldbuilding
 *
 * Provides access to worldbuilding data (characters, locations, etc.)
 * Supports multi-project access for OAuth authentication.
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { getAllProjects, hasProjectPermission } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';
import { YjsWorkerService } from '../../services/yjs-worker.service';
import { Element } from '../../schemas/element.schemas';
import { getElementsDocId } from '../tools/tree-helpers';
import { logger } from '../../services/logger.service';

const wbLog = logger.child('MCP-Worldbuilding');

/**
 * Check if running on Cloudflare Workers (has DO bindings)
 */
function isCloudflareWorkers(ctx: McpContext): boolean {
  return !!ctx.env?.YJS_PROJECTS;
}

/**
 * Get the appropriate Yjs service based on runtime
 */
function getYjsService(ctx: McpContext): YjsWorkerService | typeof yjsService {
  if (isCloudflareWorkers(ctx) && ctx.authToken && ctx.env?.YJS_PROJECTS) {
    return new YjsWorkerService({
      env: { YJS_PROJECTS: ctx.env.YJS_PROJECTS },
      authToken: ctx.authToken,
    });
  }
  return yjsService;
}

/**
 * Check if an element type is a worldbuilding type
 */
function isWorldbuildingType(type: string): boolean {
  return type === 'WORLDBUILDING';
}

/**
 * Get the worldbuilding Yjs document ID for an element
 * Note: The trailing '/' is required because y-websocket appends it to the room URL
 */
function getWorldbuildingDocId(username: string, slug: string, elementId: string): string {
  return `${username}:${slug}:${elementId}/`;
}

/**
 * Read worldbuilding elements from elements document
 */
async function getWorldbuildingElements(
  ctx: McpContext,
  username: string,
  slug: string
): Promise<Element[]> {
  try {
    const service = getYjsService(ctx);
    const elements = await service.getElements(username, slug);
    return elements.filter((e) => isWorldbuildingType(e.type));
  } catch (err) {
    wbLog.error('Error reading worldbuilding elements', err);
    return [];
  }
}

/**
 * Read worldbuilding data for an element
 */
async function readWorldbuildingData(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string
): Promise<Record<string, unknown> | null> {
  const docId = getWorldbuildingDocId(username, slug, elementId);

  try {
    const service = getYjsService(ctx);
    const sharedDoc = await service.getDocument(docId);
    const dataMap = sharedDoc.doc.getMap('worldbuilding');
    const identityMap = sharedDoc.doc.getMap('identity');

    // Convert Yjs maps to plain objects
    const data: Record<string, unknown> = {};
    const identity: Record<string, unknown> = {};

    dataMap.forEach((value: unknown, key: string) => {
      data[key] = convertYjsValue(value);
    });

    identityMap.forEach((value: unknown, key: string) => {
      identity[key] = convertYjsValue(value);
    });

    return {
      id: elementId,
      identity,
      data,
    };
  } catch (err) {
    wbLog.error('Error reading worldbuilding data', err);
    return null;
  }
}

/**
 * Convert Yjs value to plain JavaScript value
 */
function convertYjsValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Check for Yjs types (they have toJSON methods)
  if (
    typeof value === 'object' &&
    'toJSON' in value &&
    typeof (value as { toJSON: unknown }).toJSON === 'function'
  ) {
    return (value as { toJSON: () => unknown }).toJSON();
  }

  if (Array.isArray(value)) {
    return value.map(convertYjsValue);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = convertYjsValue(v);
    }
    return result;
  }

  return value;
}

/**
 * Read relationships from the project
 */
async function readRelationships(
  ctx: McpContext,
  username: string,
  slug: string
): Promise<unknown[]> {
  const docId = getElementsDocId(username, slug);

  try {
    const service = getYjsService(ctx);
    const sharedDoc = await service.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');

    // Handle both Yjs arrays and plain arrays from worker service
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (relationshipsArray as any).toJSON === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (relationshipsArray as any).toJSON() as unknown[];
    }
    // Worker service returns plain array-like wrapper
    const result: unknown[] = [];
    relationshipsArray.forEach((value: unknown) => {
      result.push(value);
    });
    return result;
  } catch (err) {
    wbLog.error('Error reading relationships', err);
    return [];
  }
}

/**
 * Worldbuilding resource handler
 */
const worldbuildingResourceHandler = {
  async getResources(ctx: McpContext): Promise<McpResource[]> {
    const resources: McpResource[] = [];
    const projects = getAllProjects(ctx);

    // Add resources for each project the user has read:worldbuilding permission for
    for (const project of projects) {
      if (!project.permissions.includes(MCP_PERMISSIONS.READ_WORLDBUILDING)) {
        continue;
      }

      const { username, slug } = project;

      // Add worldbuilding listing resource
      // Note: Individual worldbuilding elements are discovered via resources/read on this URI
      // We don't enumerate them here to avoid loading Yjs documents
      resources.push({
        uri: `inkweld://project/${username}/${slug}/worldbuilding`,
        name: `Worldbuilding (${username}/${slug})`,
        title: `All Worldbuilding Entries - ${username}/${slug}`,
        description:
          'List of all worldbuilding elements (characters, locations, items, etc.). Read this resource to discover individual entries.',
        mimeType: 'application/json',
      });

      // Add relationships resource
      resources.push({
        uri: `inkweld://project/${username}/${slug}/relationships`,
        name: `Relationships (${username}/${slug})`,
        title: `Element Relationships - ${username}/${slug}`,
        description: 'All relationships between worldbuilding elements',
        mimeType: 'application/json',
      });
    }

    return resources;
  },

  async readResource(
    ctx: McpContext,
    _db: unknown,
    uri: string
  ): Promise<McpResourceContents | null> {
    // Parse project from URI: inkweld://project/{username}/{slug}/worldbuilding or /relationships
    const projectMatch = uri.match(
      /^inkweld:\/\/project\/([^/]+)\/([^/]+)\/(worldbuilding(?:\/.*)?|relationships)$/
    );
    if (!projectMatch) {
      return null;
    }

    const [, username, slug, path] = projectMatch;

    // Check permission for this specific project
    if (!hasProjectPermission(ctx, username, slug, MCP_PERMISSIONS.READ_WORLDBUILDING)) {
      return null;
    }

    const baseUri = `inkweld://project/${username}/${slug}`;

    // Handle worldbuilding listing
    if (path === 'worldbuilding') {
      const elements = await getWorldbuildingElements(ctx, username, slug);

      // Fetch basic data for each element
      const summaries = await Promise.all(
        elements.map(async (elem) => {
          const data = await readWorldbuildingData(ctx, username, slug, elem.id);
          const identity = data?.identity as { description?: string } | undefined;
          return {
            id: elem.id,
            name: elem.name,
            type: elem.type,
            description: identity?.description ?? null,
          };
        })
      );

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(summaries, null, 2),
      };
    }

    // Handle relationships
    if (path === 'relationships') {
      const relationships = await readRelationships(ctx, username, slug);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(relationships, null, 2),
      };
    }

    // Handle individual worldbuilding element
    const wbMatch = path.match(/^worldbuilding\/(.+)$/);
    if (wbMatch) {
      const elementId = wbMatch[1];
      const data = await readWorldbuildingData(ctx, username, slug, elementId);

      if (!data) {
        return null;
      }

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      };
    }

    return null;
  },
};

// Register the handler
registerResourceHandler(worldbuildingResourceHandler);

export { worldbuildingResourceHandler };
