/**
 * MCP Resources: Elements
 *
 * Provides access to project elements (tree structure).
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';

/**
 * Element type from the Inkweld schema
 */
interface Element {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  order: number;
  level: number;
  expandable: boolean;
  version: number;
  metadata: Record<string, string>;
}

/**
 * Get the elements Yjs document ID for a project
 * Note: The trailing '/' is required because y-websocket appends it to the room URL
 */
function getElementsDocId(username: string, slug: string): string {
  return `${username}:${slug}:elements/`;
}

/**
 * Read elements from Yjs document
 */
async function readElementsFromYjs(username: string, slug: string): Promise<Element[]> {
  const docId = getElementsDocId(username, slug);

  try {
    const sharedDoc = await yjsService.getDocument(docId);

    // Elements are stored in a Y.Array, not a Y.Map
    const elementsArray = sharedDoc.doc.getArray('elements');

    const elements: Element[] = [];
    elementsArray.forEach((value) => {
      if (value && typeof value === 'object') {
        const elem = value as Record<string, unknown>;
        elements.push({
          id: String(elem.id ?? ''),
          name: String(elem.name ?? ''),
          type: String(elem.type ?? 'ITEM'),
          parentId: elem.parentId ? String(elem.parentId) : null,
          order: Number(elem.order ?? 0),
          level: Number(elem.level ?? 0),
          expandable: Boolean(elem.expandable ?? false),
          version: Number(elem.version ?? 1),
          metadata: (elem.metadata as Record<string, string>) ?? {},
        });
      }
    });

    // Sort by order
    elements.sort((a, b) => a.order - b.order);

    return elements;
  } catch (err) {
    console.error('Error reading elements from Yjs:', err);
    return [];
  }
}

/**
 * Elements resource handler
 */
const elementsResourceHandler = {
  async getResources(ctx: McpContext): Promise<McpResource[]> {
    // Check permission
    if (!ctx.permissions.includes(MCP_PERMISSIONS.READ_ELEMENTS)) {
      return [];
    }

    const resources: McpResource[] = [];
    const { username, slug } = ctx;

    // Add elements listing resource
    resources.push({
      uri: `inkweld://project/${username}/${slug}/elements`,
      name: 'Project Elements',
      title: 'Project Element Tree',
      description:
        'Hierarchical list of all project elements (documents, folders, worldbuilding entries)',
      mimeType: 'application/json',
    });

    // Add individual element resources
    const elements = await readElementsFromYjs(username, slug);
    for (const element of elements) {
      resources.push({
        uri: `inkweld://project/${username}/${slug}/element/${element.id}`,
        name: element.name,
        title: element.name,
        description: `${element.type} element`,
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.5,
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
    if (!ctx.permissions.includes(MCP_PERMISSIONS.READ_ELEMENTS)) {
      return null;
    }

    const { username, slug } = ctx;
    const baseUri = `inkweld://project/${username}/${slug}`;

    // Handle elements listing
    if (uri === `${baseUri}/elements`) {
      const elements = await readElementsFromYjs(username, slug);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(elements, null, 2),
      };
    }

    // Handle individual element
    const elementMatch = uri.match(
      new RegExp(`^${baseUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/element/(.+)$`)
    );
    if (elementMatch) {
      const elementId = elementMatch[1];
      const elements = await readElementsFromYjs(username, slug);
      const element = elements.find((e) => e.id === elementId);

      if (!element) {
        return null;
      }

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(element, null, 2),
      };
    }

    return null;
  },
};

// Register the handler
registerResourceHandler(elementsResourceHandler);

export { elementsResourceHandler };
