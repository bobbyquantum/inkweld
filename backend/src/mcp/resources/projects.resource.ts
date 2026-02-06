/**
 * MCP Resources: Projects
 *
 * Lists all projects the user has authorized access to.
 * For OAuth auth: lists all granted projects with their permission levels
 * For legacy auth: lists the single project the API key has access to
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { getAllProjects } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { logger } from '../../services/logger.service';

const mcpResourceLog = logger.child('MCP-Resources');

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
          priority: 1.0, // High priority - projects are important context
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
    const projectMatch = uri.match(/^inkweld:\/\/project\/([^/]+)\/([^/]+)$/);
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

    return null;
  },
};

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
