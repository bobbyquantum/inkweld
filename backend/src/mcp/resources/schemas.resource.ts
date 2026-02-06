/**
 * MCP Resources: Schemas
 *
 * Provides access to worldbuilding template schemas.
 * Supports multi-project access for OAuth authentication.
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { getAllProjects, hasProjectPermission } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';
import { YjsWorkerService } from '../../services/yjs-worker.service';
import { logger } from '../../services/logger.service';

const schemaLog = logger.child('MCP-Schemas');

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
 * Get the schemas Yjs document ID for a project
 * Note: The trailing '/' is required because y-websocket appends it to the room URL
 */
function getSchemaLibraryDocId(username: string, slug: string): string {
  return `${username}:${slug}:schema-library/`;
}

interface SchemaInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  isBuiltIn: boolean;
}

/**
 * Read schemas from the project's schema library
 */
async function readSchemas(ctx: McpContext, username: string, slug: string): Promise<SchemaInfo[]> {
  const docId = getSchemaLibraryDocId(username, slug);

  try {
    const service = getYjsService(ctx);
    const sharedDoc = await service.getDocument(docId);
    const schemasMap = sharedDoc.doc.getMap('schemas');

    const schemas: SchemaInfo[] = [];
    schemasMap.forEach((value: unknown, key: string) => {
      if (value && typeof value === 'object') {
        const schema = value as Record<string, unknown>;
        schemas.push({
          id: key,
          name: String(schema.name ?? key),
          description: String(schema.description ?? ''),
          icon: String(schema.icon ?? 'description'),
          isBuiltIn: Boolean(schema.isBuiltIn ?? false),
        });
      }
    });

    return schemas;
  } catch (err) {
    schemaLog.error('Error reading schemas', err);
    return [];
  }
}

/**
 * Read a specific schema by ID
 */
async function readSchema(
  ctx: McpContext,
  username: string,
  slug: string,
  schemaId: string
): Promise<unknown | null> {
  const docId = getSchemaLibraryDocId(username, slug);

  try {
    const service = getYjsService(ctx);
    const sharedDoc = await service.getDocument(docId);
    const schemasMap = sharedDoc.doc.getMap('schemas');
    const schema = schemasMap.get(schemaId);

    if (!schema) return null;

    // Convert Yjs value to plain object
    if (typeof schema === 'object' && 'toJSON' in schema) {
      return (schema as { toJSON: () => unknown }).toJSON();
    }

    return schema;
  } catch (err) {
    schemaLog.error('Error reading schema', err);
    return null;
  }
}

/**
 * Schemas resource handler
 */
const schemasResourceHandler = {
  async getResources(ctx: McpContext): Promise<McpResource[]> {
    const resources: McpResource[] = [];
    const projects = getAllProjects(ctx);

    // Add resources for each project the user has read:schemas permission for
    for (const project of projects) {
      if (!project.permissions.includes(MCP_PERMISSIONS.READ_SCHEMAS)) {
        continue;
      }

      const { username, slug } = project;

      // Add schemas listing resource
      // Note: Individual schemas are discovered via resources/read on this URI
      // We don't enumerate them here to avoid loading Yjs documents
      resources.push({
        uri: `inkweld://project/${username}/${slug}/schemas`,
        name: `Schemas (${username}/${slug})`,
        title: `Worldbuilding Template Schemas - ${username}/${slug}`,
        description:
          'List of all template schemas (built-in and custom). Read this resource to discover individual schemas.',
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
    // Parse project from URI: inkweld://project/{username}/{slug}/schemas or /schema/{id}
    const projectMatch = uri.match(/^inkweld:\/\/project\/([^/]+)\/([^/]+)\/(schemas|schema\/.+)$/);
    if (!projectMatch) {
      return null;
    }

    const [, username, slug, path] = projectMatch;

    // Check permission for this specific project
    if (!hasProjectPermission(ctx, username, slug, MCP_PERMISSIONS.READ_SCHEMAS)) {
      return null;
    }

    // Handle schemas listing
    if (path === 'schemas') {
      const schemas = await readSchemas(ctx, username, slug);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(schemas, null, 2),
      };
    }

    // Handle individual schema
    const schemaMatch = path.match(/^schema\/(.+)$/);
    if (schemaMatch) {
      const schemaId = schemaMatch[1];
      const schema = await readSchema(ctx, username, slug, schemaId);

      if (!schema) {
        return null;
      }

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(schema, null, 2),
      };
    }

    return null;
  },
};

// Register the handler
registerResourceHandler(schemasResourceHandler);

export { schemasResourceHandler };
