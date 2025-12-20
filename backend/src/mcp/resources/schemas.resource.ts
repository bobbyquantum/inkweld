/**
 * MCP Resources: Schemas
 *
 * Provides access to worldbuilding template schemas.
 */

import type { McpContext, McpResource, McpResourceContents } from '../mcp.types';
import { registerResourceHandler } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';

/**
 * Get the schemas Yjs document ID for a project
 * Note: The trailing '/' is required because y-websocket appends it to the room URL
 */
function getSchemaLibraryDocId(username: string, slug: string): string {
  return `${username}:${slug}:schema-library/`;
}

interface SchemaInfo {
  id: string;
  type: string;
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
          type: String(schema.type ?? key),
          name: String(schema.name ?? key),
          description: String(schema.description ?? ''),
          icon: String(schema.icon ?? 'description'),
          isBuiltIn: Boolean(schema.isBuiltIn ?? false),
        });
      }
    });

    return schemas;
  } catch (err) {
    console.error('Error reading schemas:', err);
    return [];
  }
}

/**
 * Read a specific schema
 */
async function readSchema(
  username: string,
  slug: string,
  schemaType: string
): Promise<unknown | null> {
  const docId = getSchemaLibraryDocId(username, slug);

  try {
    const sharedDoc = await yjsService.getDocument(docId);
    const schemasMap = sharedDoc.doc.getMap('schemas');
    const schema = schemasMap.get(schemaType);

    if (!schema) return null;

    // Convert Yjs value to plain object
    if (typeof schema === 'object' && 'toJSON' in schema) {
      return (schema as { toJSON: () => unknown }).toJSON();
    }

    return schema;
  } catch (err) {
    console.error('Error reading schema:', err);
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
        uri: `inkweld://project/${username}/${slug}/schema/${schema.type}`,
        name: schema.name,
        title: `${schema.name} Schema`,
        description: schema.description || `Template for ${schema.type}`,
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
      const schemaType = schemaMatch[1];
      const schema = await readSchema(username, slug, schemaType);

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
