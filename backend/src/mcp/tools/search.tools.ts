/**
 * MCP Tools: Search
 *
 * Provides search functionality across project content.
 *
 * IMPORTANT: Inkweld uses a **positional hierarchy** model:
 * - Elements are stored in a flat array
 * - Parent-child relationships are determined by ARRAY POSITION + LEVEL
 * - Children must IMMEDIATELY FOLLOW their parent in the array
 * - The frontend finds parents by searching BACKWARDS for level - 1
 *
 * See tree-helpers.ts for detailed documentation on this model.
 */

import type { McpContext, McpToolResult, ActiveProjectContext } from '../mcp.types';
import { getProjectByKey, hasProjectPermission } from '../mcp.types';
import { registerTool } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';
import { YjsWorkerService } from '../../services/yjs-worker.service';
import { Element } from '../../schemas/element.schemas';
import { buildVisualTree, treeToText } from './tree-helpers';
import { logger } from '../../services/logger.service';

const mcpSearchLog = logger.child('MCP-Search');

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
 * Property schema for project parameter (reused across all tools)
 */
const projectPropertySchema = {
  type: 'string',
  description: 'Project identifier in "username/slug" format (e.g., "alice/my-novel").',
} as const;

/**
 * Parse and validate the project parameter.
 * Returns the project context or an error result.
 */
function parseProjectParam(
  ctx: McpContext,
  projectArg: unknown,
  permission: string
): { project: ActiveProjectContext } | { error: McpToolResult } {
  const projectStr = String(projectArg ?? '').trim();

  if (!projectStr) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: 'Error: project parameter is required (format: "username/slug")',
          },
        ],
        isError: true,
      },
    };
  }

  const parts = projectStr.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: `Error: invalid project format "${projectStr}". Expected "username/slug"`,
          },
        ],
        isError: true,
      },
    };
  }

  const [username, slug] = parts;

  // Check if this project is in the user's grants
  const project = getProjectByKey(ctx, username, slug);
  if (!project) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: `Error: project "${projectStr}" not found in authorized projects`,
          },
        ],
        isError: true,
      },
    };
  }

  // Check permission for this project
  if (!hasProjectPermission(ctx, username, slug, permission)) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: `Error: permission "${permission}" not granted for project "${projectStr}"`,
          },
        ],
        isError: true,
      },
    };
  }

  return { project };
}

interface SearchResult {
  elementId: string;
  elementName: string;
  elementType: string;
  matchedField?: string;
  matchedValue?: string;
  score: number;
}

/**
 * Get elements from Yjs (uses appropriate service based on runtime)
 */
async function getElements(ctx: McpContext, username: string, slug: string): Promise<Element[]> {
  try {
    const service = getYjsService(ctx);
    const elements = await service.getElements(username, slug);
    return elements;
  } catch (err) {
    mcpSearchLog.error('Error getting elements', err);
    return [];
  }
}

/**
 * Get worldbuilding data for an element
 */
async function getWorldbuildingData(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string
): Promise<Record<string, unknown> | null> {
  // Note: The trailing '/' is required because y-websocket appends it to the room URL
  const docId = `${username}:${slug}:${elementId}/`;

  try {
    const service = getYjsService(ctx);
    const sharedDoc = await service.getDocument(docId);
    const dataMap = sharedDoc.doc.getMap('worldbuilding');
    const identityMap = sharedDoc.doc.getMap('identity');

    const result: Record<string, unknown> = {};

    dataMap.forEach((value: unknown, key: string) => {
      result[key] = convertYjsValue(value);
    });

    identityMap.forEach((value: unknown, key: string) => {
      result[`identity.${key}`] = convertYjsValue(value);
    });

    return result;
  } catch {
    return null;
  }
}

function convertYjsValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value === 'object' &&
    'toJSON' in value &&
    typeof (value as { toJSON: unknown }).toJSON === 'function'
  ) {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  if (Array.isArray(value)) return value.map(convertYjsValue);
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
 * Simple text matching with score
 */
function matchText(text: string, query: string): number {
  if (!text || !query) return 0;

  // Wildcard matches everything
  if (query === '*') return 1.0;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match
  if (lowerText === lowerQuery) return 1.0;

  // Contains query
  if (lowerText.includes(lowerQuery)) return 0.8;

  // Word match
  const words = lowerQuery.split(/\s+/);
  const matchedWords = words.filter((w) => lowerText.includes(w));
  if (matchedWords.length > 0) {
    return 0.5 * (matchedWords.length / words.length);
  }

  return 0;
}

/**
 * Recursively search object for matching text
 */
function searchInObject(
  obj: Record<string, unknown>,
  query: string,
  prefix = ''
): Array<{ field: string; value: string; score: number }> {
  const results: Array<{ field: string; value: string; score: number }> = [];

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      const score = matchText(value, query);
      if (score > 0) {
        results.push({ field: fieldPath, value, score });
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          const score = matchText(item, query);
          if (score > 0) {
            results.push({ field: fieldPath, value: item, score });
          }
        } else if (typeof item === 'object' && item !== null) {
          results.push(...searchInObject(item as Record<string, unknown>, query, fieldPath));
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      results.push(...searchInObject(value as Record<string, unknown>, query, fieldPath));
    }
  }

  return results;
}

// ============================================
// get_project_tree tool
// ============================================

registerTool({
  tool: {
    name: 'get_project_tree',
    title: 'Get Project Tree',
    description: `Get the full hierarchical tree structure of the project elements.

UNDERSTANDING THE TREE STRUCTURE:
Inkweld uses POSITIONAL HIERARCHY - the flat array order determines parent-child relationships:
- Elements are stored in a flat array
- A child is any element that:
  1. Comes IMMEDIATELY AFTER its parent in the array
  2. Has level = parent.level + 1
  3. The subtree ends when an element with level <= parent.level is reached

Example array order:
  [0] Characters (level 0)      ← Parent folder
  [1] Elena (level 1)           ← Child of Characters  
  [2] Marcus (level 1)          ← Child of Characters
  [3] Locations (level 0)       ← New root (ends Characters subtree)
  [4] Tavern (level 1)          ← Child of Locations

The 'parentId' field is stored for convenience but the frontend
determines hierarchy by POSITION, not by parentId.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        parentId: {
          type: 'string',
          description:
            'Optional: Get only the subtree under this element ID. Leave empty for full tree from root.',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: unlimited)',
        },
      },
      required: ['project'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const parentId = args.parentId ? String(args.parentId) : null;
    const maxDepth = args.maxDepth ? Number(args.maxDepth) : Infinity;

    const elements = await getElements(ctx, username, slug);

    // Build visual tree using positional hierarchy
    const fullTree = buildVisualTree(elements);

    // If parentId specified, find that subtree
    let tree = fullTree;
    if (parentId) {
      const findSubtree = (
        nodes: ReturnType<typeof buildVisualTree>
      ): ReturnType<typeof buildVisualTree> | null => {
        for (const node of nodes) {
          if (node.id === parentId) return node.children;
          const found = findSubtree(node.children);
          if (found) return found;
        }
        return null;
      };
      tree = findSubtree(fullTree) ?? [];
    }

    // Apply maxDepth
    const limitDepth = (
      nodes: ReturnType<typeof buildVisualTree>,
      currentDepth: number
    ): ReturnType<typeof buildVisualTree> => {
      if (currentDepth >= maxDepth) return nodes.map((n) => ({ ...n, children: [] }));
      return nodes.map((n) => ({
        ...n,
        children: limitDepth(n.children, currentDepth + 1),
      }));
    };

    if (maxDepth !== Infinity) {
      tree = limitDepth(tree, 0);
    }

    // Generate text representation
    const treeText = treeToText(elements);
    const totalCount = elements.length;

    return {
      content: [
        {
          type: 'text',
          text: `Project tree (${totalCount} elements total):\n\n${treeText || '(empty project)'}\n\nNote: Tree structure is determined by array position + level, not parentId.`,
        },
      ],
      structuredContent: {
        total: totalCount,
        tree,
      },
    };
  },
});

// ============================================
// search_elements tool
// ============================================

registerTool({
  tool: {
    name: 'search_elements',
    title: 'Search Elements',
    description: 'Search for elements in the project by name or type',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        query: {
          type: 'string',
          description: 'Search query to match against element names',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by element types (e.g., CHARACTER, LOCATION, FOLDER, ITEM)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20)',
        },
      },
      required: ['project', 'query'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const query = String(args.query ?? '');
    const types = (args.types as string[] | undefined) ?? [];
    const limit = Math.min(Number(args.limit) || 20, 100);

    const elements = await getElements(ctx, username, slug);

    // Filter and score
    const results: SearchResult[] = [];

    for (const elem of elements) {
      // Type filter
      if (types.length > 0 && !types.includes(elem.type)) {
        continue;
      }

      const score = matchText(elem.name, query);
      if (score > 0) {
        results.push({
          elementId: elem.id,
          elementName: elem.name,
          elementType: elem.type,
          score,
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.length} elements matching "${query}"${types.length > 0 ? ` (filtered by: ${types.join(', ')})` : ''}`,
        },
      ],
      structuredContent: {
        total: results.length,
        results: topResults,
      },
    };
  },
});

// ============================================
// search_worldbuilding tool
// ============================================

registerTool({
  tool: {
    name: 'search_worldbuilding',
    title: 'Search Worldbuilding',
    description: 'Search across all worldbuilding content (characters, locations, items, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        query: {
          type: 'string',
          description: 'Search query to match against worldbuilding data',
        },
        schemaTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by schema types (e.g., CHARACTER, LOCATION)',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific fields to search in (e.g., backstory, description)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
      },
      required: ['project', 'query'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const query = String(args.query ?? '');
    const schemaTypes = (args.schemaTypes as string[] | undefined) ?? [];
    const fields = (args.fields as string[] | undefined) ?? [];
    const limit = Math.min(Number(args.limit) || 10, 50);

    const elements = await getElements(ctx, username, slug);

    // Filter to worldbuilding types
    const wbElements = elements.filter(
      (e) =>
        e.type === 'WORLDBUILDING' &&
        (schemaTypes.length === 0 || (e.schemaId && schemaTypes.includes(e.schemaId)))
    );

    const results: SearchResult[] = [];

    for (const elem of wbElements) {
      const data = await getWorldbuildingData(ctx, username, slug, elem.id);
      if (!data) continue;

      // Search name first
      const nameScore = matchText(elem.name, query);
      if (nameScore > 0) {
        results.push({
          elementId: elem.id,
          elementName: elem.name,
          elementType: elem.type,
          matchedField: 'name',
          matchedValue: elem.name,
          score: nameScore,
        });
      }

      // Search in data
      const matches = searchInObject(data, query);

      // Filter by field if specified
      const filteredMatches =
        fields.length > 0
          ? matches.filter((m) => fields.some((f) => m.field.includes(f)))
          : matches;

      for (const match of filteredMatches) {
        results.push({
          elementId: elem.id,
          elementName: elem.name,
          elementType: elem.type,
          matchedField: match.field,
          matchedValue: match.value.substring(0, 200),
          score: match.score,
        });
      }
    }

    // Deduplicate by elementId, keeping highest score
    const deduped = new Map<string, SearchResult>();
    for (const r of results) {
      const existing = deduped.get(r.elementId);
      if (!existing || r.score > existing.score) {
        deduped.set(r.elementId, r);
      }
    }

    // Sort and limit
    const sortedResults = Array.from(deduped.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${deduped.size} worldbuilding entries matching "${query}"`,
        },
      ],
      structuredContent: {
        total: deduped.size,
        results: sortedResults,
      },
    };
  },
});

// ============================================
// search_relationships tool
// ============================================

registerTool({
  tool: {
    name: 'search_relationships',
    title: 'Search Relationships',
    description: 'Find elements connected to a specific element through relationships',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'The element ID to find relationships for',
        },
        relationshipType: {
          type: 'string',
          description: 'Filter by relationship type (e.g., parent-of, located-in)',
        },
        direction: {
          type: 'string',
          enum: ['source', 'target', 'both'],
          description: 'Relationship direction (default: both)',
        },
      },
      required: ['project', 'elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId);
    const relationshipType = args.relationshipType as string | undefined;
    const direction = (args.direction as string) || 'both';

    // Get relationships
    const docId = `${username}:${slug}:elements/`;
    const service = getYjsService(ctx);
    const sharedDoc = await service.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');
    // Use correct property names matching frontend ElementRelationship interface
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawRelationships = (relationshipsArray as any).toJSON
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (relationshipsArray as any).toJSON()
      : [];
    const allRelationships = rawRelationships as Array<{
      id: string;
      sourceElementId: string;
      targetElementId: string;
      relationshipTypeId: string;
      note?: string;
      createdAt?: string;
      updatedAt?: string;
    }>;

    // Filter relationships
    const matching = allRelationships.filter((r) => {
      // Type filter
      if (relationshipType && r.relationshipTypeId !== relationshipType) return false;

      // Direction filter
      if (direction === 'source' && r.sourceElementId !== elementId) return false;
      if (direction === 'target' && r.targetElementId !== elementId) return false;
      if (
        direction === 'both' &&
        r.sourceElementId !== elementId &&
        r.targetElementId !== elementId
      )
        return false;

      return true;
    });

    // Get element names
    const elements = await getElements(ctx, username, slug);
    const elementMap = new Map(elements.map((e) => [e.id, e]));

    const enriched = matching.map((r) => ({
      ...r,
      sourceName: elementMap.get(r.sourceElementId)?.name ?? 'Unknown',
      sourceType: elementMap.get(r.sourceElementId)?.type ?? 'Unknown',
      targetName: elementMap.get(r.targetElementId)?.name ?? 'Unknown',
      targetType: elementMap.get(r.targetElementId)?.type ?? 'Unknown',
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${matching.length} relationships for element ${elementId}`,
        },
      ],
      structuredContent: {
        elementId,
        total: matching.length,
        relationships: enriched,
      },
    };
  },
});

export {};
