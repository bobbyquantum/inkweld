/**
 * MCP Resources: Projects
 *
 * Lists all projects the user has authorized access to.
 * For OAuth auth: lists all granted projects with their permission levels
 * For legacy auth: lists the single project the API key has access to
 */

import {
  type McpContext,
  type McpResource,
  type McpResourceContents,
  McpRpcError,
  JSON_RPC_ERRORS,
  getAllProjects,
} from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { getElements, getWorldbuildingDoc } from '../tools/yjs-runtime';
import { logger } from '../../services/logger.service';

const _mcpResourceLog = logger.child('MCP-Resources');

/**
 * Permission required to read each project sub-resource.
 */
const SUB_RESOURCE_PERMISSIONS: Record<'elements' | 'worldbuilding' | 'schemas', string> = {
  elements: 'read:elements',
  worldbuilding: 'read:worldbuilding',
  schemas: 'read:schemas',
};

/**
 * Projects resource handler
 */
const projectsResourceHandler = {
  async getResources(ctx: McpContext): Promise<McpResource[]> {
    const projects = getAllProjects(ctx);

    if (projects.length === 0) {
      return [];
    }

    const resources: McpResource[] = [];

    // Add a summary resource listing all projects
    resources.push({
      uri: 'inkweld://projects',
      name: 'Authorized Projects',
      title: 'Authorized Projects List',
      description: `List of ${projects.length} project(s) you have access to. Read this resource to see project details and permissions.`,
      mimeType: 'application/json',
    });

    // Add individual project resources
    for (const project of projects) {
      const permSummary = summarizePermissions(project.permissions);
      resources.push({
        uri: `inkweld://project/${project.username}/${project.slug}`,
        name: `${project.username}/${project.slug}`,
        title: `Project: ${project.username}/${project.slug}`,
        description: `Access: ${permSummary}`,
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 1, // High priority - projects are important context
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
    const projects = getAllProjects(ctx);

    // Handle projects listing
    if (uri === 'inkweld://projects') {
      const projectList = projects.map((p) => ({
        username: p.username,
        slug: p.slug,
        projectKey: `${p.username}/${p.slug}`,
        role: p.role,
        permissions: p.permissions,
        permissionSummary: summarizePermissions(p.permissions),
      }));

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            totalProjects: projects.length,
            projects: projectList,
            usage: {
              note: 'Use projectKey (username/slug) when calling tools that require a project parameter.',
              example: 'For project "alice/my-novel", use project: "alice/my-novel" in tool calls.',
            },
          },
          null,
          2
        ),
      };
    }

    // Handle individual project resource
    const projectMatch = /^inkweld:\/\/project\/([^/]+)\/([^/]+)$/.exec(uri);
    if (projectMatch) {
      const [, username, slug] = projectMatch;
      const project = projects.find((p) => p.username === username && p.slug === slug);

      if (!project) {
        return null;
      }

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            projectKey: `${project.username}/${project.slug}`,
            username: project.username,
            slug: project.slug,
            projectId: project.projectId,
            role: project.role,
            permissions: project.permissions,
            permissionSummary: summarizePermissions(project.permissions),
            availableResources: getAvailableResources(
              project.username,
              project.slug,
              project.permissions
            ),
          },
          null,
          2
        ),
      };
    }

    // Handle project sub-resources (elements / worldbuilding / schemas)
    const subResourceMatch =
      /^inkweld:\/\/project\/([^/]+)\/([^/]+)\/(elements|worldbuilding|schemas)$/.exec(uri);
    if (subResourceMatch) {
      const [, username, slug, subResource] = subResourceMatch;
      const project = projects.find((p) => p.username === username && p.slug === slug);

      if (!project) {
        return null;
      }

      const permissionForResource =
        SUB_RESOURCE_PERMISSIONS[subResource as keyof typeof SUB_RESOURCE_PERMISSIONS];
      if (!project.permissions.includes(permissionForResource)) {
        throw new McpRpcError(
          JSON_RPC_ERRORS.INVALID_REQUEST,
          `Permission denied: missing ${permissionForResource} for resource ${uri}`
        );
      }

      return readSubResource(ctx, uri, username, slug, subResource);
    }

    return null;
  },
};

/**
 * Read a project sub-resource (elements / worldbuilding / schemas).
 */
async function readSubResource(
  ctx: McpContext,
  uri: string,
  username: string,
  slug: string,
  subResource: string
): Promise<McpResourceContents> {
  try {
    if (subResource === 'elements') {
      const elements = await getElements(ctx, username, slug);
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            total: elements.length,
            elements: elements.map((el) => ({
              id: el.id,
              name: el.name,
              type: el.type,
              level: el.level,
            })),
          },
          null,
          2
        ),
      };
    }

    if (subResource === 'worldbuilding') {
      return readWorldbuilding(ctx, uri, username, slug);
    }

    // schemas: no dedicated Yjs doc in the unified runtime; return a stable
    // empty listing so the advertised sub-resource resolves.
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify({ total: 0, schemas: [] }, null, 2),
    };
  } catch (err) {
    _mcpResourceLog.error(`[resources/read] Failed to read ${subResource} for ${uri}`, {
      error: err,
    });
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify({ uri, error: `Failed to read project ${subResource}` }, null, 2),
    };
  }
}

/**
 * Read the worldbuilding sub-resource. Bounds the read to avoid an unbounded
 * N+1 document load on large projects and processes with limited concurrency.
 */
async function readWorldbuilding(
  ctx: McpContext,
  uri: string,
  username: string,
  slug: string
): Promise<McpResourceContents> {
  const MAX_ELEMENTS = 200;
  const CONCURRENCY = 8;

  const elements = await getElements(ctx, username, slug);
  const worldbuilding: Record<string, unknown> = {};
  const sample = elements.slice(0, MAX_ELEMENTS);
  let index = 0;
  const worker = async () => {
    while (index < sample.length) {
      const el = sample[index++];
      try {
        const doc = await getWorldbuildingDoc(ctx, username, slug, el.id);
        const data = doc.toJSON();
        if (Object.keys(data).length > 0) {
          worldbuilding[el.id] = { name: el.name, data };
        }
      } catch (err) {
        // No worldbuilding doc for this element is expected; log real
        // failures at debug level so they are not silently hidden.
        _mcpResourceLog.debug(
          `[resources/read] No worldbuilding doc for element ${el.id} in ${username}/${slug}`,
          { error: err }
        );
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return {
    uri,
    mimeType: 'application/json',
    text: JSON.stringify(
      {
        totalEntries: Object.keys(worldbuilding).length,
        truncated: elements.length > MAX_ELEMENTS,
        worldbuilding,
      },
      null,
      2
    ),
  };
}

/**
 * Summarize permissions into human-readable form
 */
function summarizePermissions(permissions: string[]): string {
  const categories: string[] = [];

  if (permissions.includes('read:elements') || permissions.includes('write:elements')) {
    categories.push(
      permissions.includes('write:elements') ? 'elements (read/write)' : 'elements (read)'
    );
  }
  if (permissions.includes('read:schemas') || permissions.includes('write:schemas')) {
    categories.push(
      permissions.includes('write:schemas') ? 'schemas (read/write)' : 'schemas (read)'
    );
  }
  if (permissions.includes('read:worldbuilding') || permissions.includes('write:worldbuilding')) {
    categories.push(
      permissions.includes('write:worldbuilding')
        ? 'worldbuilding (read/write)'
        : 'worldbuilding (read)'
    );
  }
  if (permissions.includes('generate:images')) {
    categories.push('image generation');
  }

  return categories.length > 0 ? categories.join(', ') : 'no permissions';
}

/**
 * Get available resource URIs based on permissions
 */
function getAvailableResources(username: string, slug: string, permissions: string[]): string[] {
  const resources: string[] = [];
  const base = `inkweld://project/${username}/${slug}`;

  if (permissions.includes('read:elements') || permissions.includes('write:elements')) {
    resources.push(`${base}/elements`);
  }
  if (permissions.includes('read:schemas') || permissions.includes('write:schemas')) {
    resources.push(`${base}/schemas`);
  }
  if (permissions.includes('read:worldbuilding') || permissions.includes('write:worldbuilding')) {
    resources.push(`${base}/worldbuilding`);
  }

  return resources;
}

// Register the handler
registerResourceHandler(projectsResourceHandler);

export default projectsResourceHandler;
