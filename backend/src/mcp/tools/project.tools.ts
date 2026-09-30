/**
 * MCP Tools: Projects
 *
 * Tool equivalents of the project MCP resources. Some MCP clients (e.g.
 * Claude's connector) only surface tools, so project discovery and schema
 * access must be available as tools too.
 */

import type { McpContext, McpToolResult } from '../mcp.types';
import { getAllProjects } from '../mcp.types';
import { registerTool } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import { logger } from '../../services/logger.service';
import { loadProjectSchemas, summarizePermissions } from '../resources/projects.resource';
import { parseProjectParam } from './search.tools';

const mcpProjectLog = logger.child('MCP-Projects');

/** Wrap a JSON-serializable payload as a text tool result. */
function textResult(payload: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/** Build an `isError` tool result with an `Error:`-prefixed message. */
function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ============================================
// list_projects tool
// ============================================

registerTool({
  tool: {
    name: 'list_projects',
    title: 'List Projects',
    description:
      'List the projects you are authorized to access, with your role and permissions for each. ' +
      'Call this FIRST to discover project keys ("username/slug"), which every other tool needs ' +
      'as its `project` argument.',
    inputSchema: { type: 'object', properties: {} },
  },
  // No required permissions: this only reports the caller's own grants, so it
  // is always listed and callable for any authorized MCP context.
  requiredPermissions: [],
  execute(ctx: McpContext): Promise<McpToolResult> {
    const projects = getAllProjects(ctx);
    return Promise.resolve(
      textResult({
        totalProjects: projects.length,
        projects: projects.map((p) => ({
          username: p.username,
          slug: p.slug,
          projectKey: `${p.username}/${p.slug}`,
          role: p.role,
          permissions: p.permissions,
          permissionSummary: summarizePermissions(p.permissions),
        })),
        usage: {
          note: 'Use projectKey (username/slug) when calling tools that require a project parameter.',
          example: 'For project "alice/my-novel", use project: "alice/my-novel" in tool calls.',
        },
      })
    );
  },
});

// ============================================
// get_project_schemas tool
// ============================================

registerTool({
  tool: {
    name: 'get_project_schemas',
    title: 'Get Project Schemas',
    description:
      'Get the worldbuilding element types (schemas/templates, e.g. Character, Location) defined for a project, ' +
      "with each one's id, name, icon, description, tabs/fields and defaults. Call this before create_element " +
      'or update_worldbuilding to learn the valid schema ids and field keys. Use list_projects first to find the project key.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project identifier in "username/slug" format (e.g., "alice/my-novel").',
        },
      },
      required: ['project'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_SCHEMAS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const parsed = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_SCHEMAS);
    if ('error' in parsed) return parsed.error;
    const { username, slug } = parsed.project;
    const projectKey = `${username}/${slug}`;
    try {
      return textResult(await loadProjectSchemas(ctx, username, slug));
    } catch (err) {
      mcpProjectLog.error(`get_project_schemas failed for ${projectKey}`, { error: err });
      return errorResult(`failed to read schemas for "${projectKey}"`);
    }
  },
});
