/**
 * MCP Resources: Schemas
 *
 * Provides access to worldbuilding template schemas.
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';
import { logger } from '../../services/logger.service';

const schemaLog = logger.child('MCP-Schemas');

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
async function readSchemas(username: string, slug: string): Promise<SchemaInfo[]> {
  const docId = getSchemaLibraryDocId(username, slug);

  try {
    const sharedDoc = await yjsService.getDocument(docId);
    const schemasMap = sharedDoc.doc.getMap('schemas');

    const schemas: SchemaInfo[] = [];
    schemasMap.forEach((value, key) => {
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
  username: string,
  slug: string,
  schemaId: string
): Promise<unknown | null> {
  const docId = getSchemaLibraryDocId(username, slug);

  try {
    const sharedDoc = await yjsService.getDocument(docId);
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
    // Check permission
    if (!ctx.permissions.includes(MCP_PERMISSIONS.READ_SCHEMAS)) {
      return [];
    }

    const resources: McpResource[] = [];
    const { username, slug } = ctx;

    // Add schemas listing resource
    resources.push({
      uri: `inkweld://project/${username}/${slug}/schemas`,
      name: 'Template Schemas',
      title: 'Worldbuilding Template Schemas',
      description: 'List of all template schemas (built-in and custom)',
      mimeType: 'application/json',
    });

    // Add individual schema resources
    const schemas = await readSchemas(username, slug);
    for (const schema of schemas) {
      resources.push({
        uri: `inkweld://project/${username}/${slug}/schema/${schema.id}`,
        name: schema.name,
        title: `${schema.name} Schema`,
        description: schema.description || `Template: ${schema.name}`,
        mimeType: 'application/json',
        annotations: {
          audience: ['assistant'],
          priority: 0.3,
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
    if (!ctx.permissions.includes(MCP_PERMISSIONS.READ_SCHEMAS)) {
      return null;
    }

    const { username, slug } = ctx;
    const baseUri = `inkweld://project/${username}/${slug}`;

    // Handle schemas listing
    if (uri === `${baseUri}/schemas`) {
      const schemas = await readSchemas(username, slug);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(schemas, null, 2),
      };
    }

    // Handle individual schema
    const schemaMatch = uri.match(
      new RegExp(`^${baseUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/schema/(.+)$`)
    );
    if (schemaMatch) {
      const schemaId = schemaMatch[1];
      const schema = await readSchema(username, slug, schemaId);

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
