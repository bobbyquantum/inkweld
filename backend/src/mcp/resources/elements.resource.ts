/**
 * MCP Resources: Elements
 *
 * Provides access to project elements (tree structure).
 * Supports multi-project access for OAuth authentication.
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { getAllProjects, hasProjectPermission } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';
import { YjsWorkerService } from '../../services/yjs-worker.service';
import { Element } from '../../schemas/element.schemas';
import { logger } from '../../services/logger.service';

const mcpResourceLog = logger.child('MCP-Resources');

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
 * Read elements from Yjs document
 */
async function readElementsFromYjs(
  ctx: McpContext,
  username: string,
  slug: string
): Promise<Element[]> {
  try {
    const service = getYjsService(ctx);
    return await service.getElements(username, slug);
  } catch (err) {
    mcpResourceLog.error('Error reading elements from Yjs', err);
    return [];
  }
}

/**
 * Elements resource handler
 */
const elementsResourceHandler = {
  async getResources(ctx: McpContext): Promise<McpResource[]> {
    const resources: McpResource[] = [];
    const projects = getAllProjects(ctx);

    // Add resources for each project the user has read:elements permission for
    for (const project of projects) {
      if (!project.permissions.includes(MCP_PERMISSIONS.READ_ELEMENTS)) {
        continue;
      }

      const { username, slug } = project;

      // Add elements listing resource
      // Note: Individual elements are discovered via resources/read on this URI
      // We don't enumerate them here to avoid loading Yjs documents
      resources.push({
        uri: `inkweld://project/${username}/${slug}/elements`,
        name: `Elements (${username}/${slug})`,
        title: `Project Element Tree - ${username}/${slug}`,
        description:
          'Hierarchical list of all project elements (documents, folders, worldbuilding entries). Read this resource to discover individual elements.',
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
    // Parse project from URI: inkweld://project/{username}/{slug}/elements or /element/{id}
    const projectMatch = uri.match(
      /^inkweld:\/\/project\/([^/]+)\/([^/]+)\/(elements|element\/.+)$/
    );
    if (!projectMatch) {
      return null;
    }

    const [, username, slug, path] = projectMatch;

    // Check permission for this specific project
    if (!hasProjectPermission(ctx, username, slug, MCP_PERMISSIONS.READ_ELEMENTS)) {
      return null;
    }

    // Handle elements listing
    if (path === 'elements') {
      const elements = await readElementsFromYjs(ctx, username, slug);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(elements, null, 2),
      };
    }

    // Handle individual element
    const elementMatch = path.match(/^element\/(.+)$/);
    if (elementMatch) {
      const elementId = elementMatch[1];
      const elements = await readElementsFromYjs(ctx, username, slug);
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
