/**
 * MCP Resources: Worldbuilding
 *
 * Provides access to worldbuilding data (characters, locations, etc.)
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';
import { Element } from '../../schemas/element.schemas';
import { getElementsDocId } from '../tools/tree-helpers';
import { logger } from '../../services/logger.service';

const wbLog = logger.child('MCP-Worldbuilding');

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
async function getWorldbuildingElements(username: string, slug: string): Promise<Element[]> {
  try {
    const elements = await yjsService.getElements(username, slug);
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
  username: string,
  slug: string,
  elementId: string
): Promise<Record<string, unknown> | null> {
  const docId = getWorldbuildingDocId(username, slug, elementId);

  try {
    const sharedDoc = await yjsService.getDocument(docId);
    const dataMap = sharedDoc.doc.getMap('worldbuilding');
    const identityMap = sharedDoc.doc.getMap('identity');

    // Convert Yjs maps to plain objects
    const data: Record<string, unknown> = {};
    const identity: Record<string, unknown> = {};

    dataMap.forEach((value, key) => {
      data[key] = convertYjsValue(value);
    });

    identityMap.forEach((value, key) => {
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
async function readRelationships(username: string, slug: string): Promise<unknown[]> {
  const docId = getElementsDocId(username, slug);

  try {
    const sharedDoc = await yjsService.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');

    return relationshipsArray.toJSON() as unknown[];
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
    // Check permission
    if (!ctx.permissions.includes(MCP_PERMISSIONS.READ_WORLDBUILDING)) {
      return [];
    }

    const resources: McpResource[] = [];
    const { username, slug } = ctx;

    // Add worldbuilding listing resource
    resources.push({
      uri: `inkweld://project/${username}/${slug}/worldbuilding`,
      name: 'Worldbuilding Elements',
      title: 'All Worldbuilding Entries',
      description: 'List of all worldbuilding elements (characters, locations, items, etc.)',
      mimeType: 'application/json',
    });

    // Add relationships resource
    resources.push({
      uri: `inkweld://project/${username}/${slug}/relationships`,
      name: 'Relationships',
      title: 'Element Relationships',
      description: 'All relationships between worldbuilding elements',
      mimeType: 'application/json',
    });

    // Add individual worldbuilding element resources
    const elements = await getWorldbuildingElements(username, slug);
    for (const element of elements) {
      resources.push({
        uri: `inkweld://project/${username}/${slug}/worldbuilding/${element.id}`,
        name: element.name,
        title: `${element.name} (${element.type})`,
        description: `${element.type.toLowerCase()} worldbuilding entry`,
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.7,
        },
      });
    }

    return resources;
  },

  async readResource(
    ctx: McpContext,
    _db: unknown,
    uri: string
  ): Promise<McpResourceContents | null> {
    // Check permission
    if (!ctx.permissions.includes(MCP_PERMISSIONS.READ_WORLDBUILDING)) {
      return null;
    }

    const { username, slug } = ctx;
    const baseUri = `inkweld://project/${username}/${slug}`;

    // Handle worldbuilding listing
    if (uri === `${baseUri}/worldbuilding`) {
      const elements = await getWorldbuildingElements(username, slug);

      // Fetch basic data for each element
      const summaries = await Promise.all(
        elements.map(async (elem) => {
          const data = await readWorldbuildingData(username, slug, elem.id);
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
    if (uri === `${baseUri}/relationships`) {
      const relationships = await readRelationships(username, slug);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(relationships, null, 2),
      };
    }

    // Handle individual worldbuilding element
    const wbMatch = uri.match(
      new RegExp(`^${baseUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/worldbuilding/(.+)$`)
    );
    if (wbMatch) {
      const elementId = wbMatch[1];
      const data = await readWorldbuildingData(username, slug, elementId);

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
