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
import { getStorageService } from '../../services/storage.service';
import { Element } from '../../schemas/element.schemas';
import { buildVisualTree, treeToText } from './tree-helpers';
import { getRelationships as runtimeGetRelationships } from './yjs-runtime';
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
 * Get worldbuilding data for an element, returning separate worldbuilding and identity objects
 */
async function getWorldbuildingData(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string
): Promise<{ worldbuilding: Record<string, unknown>; identity: Record<string, unknown> } | null> {
  // Note: The trailing '/' is required because y-websocket appends it to the room URL
  const docId = `${username}:${slug}:${elementId}/`;

  try {
    const service = getYjsService(ctx);
    const sharedDoc = await service.getDocument(docId);
    const dataMap = sharedDoc.doc.getMap('worldbuilding');
    const identityMap = sharedDoc.doc.getMap('identity');

    const worldbuilding: Record<string, unknown> = {};
    const identity: Record<string, unknown> = {};

    dataMap.forEach((value: unknown, key: string) => {
      worldbuilding[key] = convertYjsValue(value);
    });

    identityMap.forEach((value: unknown, key: string) => {
      identity[key] = convertYjsValue(value);
    });

    return { worldbuilding, identity };
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
    description:
      'Search across all worldbuilding content (characters, locations, items, etc.). Set includeFullContent=true to get complete worldbuilding data.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        query: {
          type: 'string',
          description: 'Search query to match against worldbuilding data. Use "*" to match all.',
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
        includeFullContent: {
          type: 'boolean',
          description: 'Include full worldbuilding data for each result (default: false)',
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
    const includeFullContent = Boolean(args.includeFullContent);

    const elements = await getElements(ctx, username, slug);

    // Filter to worldbuilding types
    const wbElements = elements.filter(
      (e) =>
        e.type === 'WORLDBUILDING' &&
        (schemaTypes.length === 0 || (e.schemaId && schemaTypes.includes(e.schemaId)))
    );

    interface EnrichedResult extends SearchResult {
      worldbuildingData?: Record<string, unknown>;
      schemaId?: string;
    }

    const results: EnrichedResult[] = [];
    const elementDataCache = new Map<string, Record<string, unknown>>();

    for (const elem of wbElements) {
      const data = await getWorldbuildingData(ctx, username, slug, elem.id);
      if (!data) continue;

      // Cache data for later use if includeFullContent is true
      if (includeFullContent) {
        elementDataCache.set(elem.id, data);
      }

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
          schemaId: elem.schemaId,
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
          matchedValue: includeFullContent ? match.value : match.value.substring(0, 200),
          score: match.score,
          schemaId: elem.schemaId,
        });
      }
    }

    // Deduplicate by elementId, keeping highest score
    const deduped = new Map<string, EnrichedResult>();
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

    // Add full worldbuilding data if requested
    if (includeFullContent) {
      for (const result of sortedResults) {
        result.worldbuildingData = elementDataCache.get(result.elementId);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Found ${deduped.size} worldbuilding entries matching "${query}"${includeFullContent ? ' (with full content)' : ''}`,
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

    // Get relationships using the runtime-aware helper (works on both Bun and Cloudflare)
    const allRelationships = await runtimeGetRelationships(ctx, username, slug);

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

// ============================================
// get_element_full tool
// ============================================

registerTool({
  tool: {
    name: 'get_element_full',
    title: 'Get Element Full',
    description:
      'Get complete element data including all worldbuilding content, relationships, and metadata. Use this to retrieve all data about a specific character, location, or other worldbuilding element.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'The ID of the element to retrieve',
        },
      },
      required: ['project', 'elementId'],
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

    const elementId = String(args.elementId ?? '');
    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    const elements = await getElements(ctx, username, slug);
    const element = elements.find((e) => e.id === elementId);

    if (!element) {
      return {
        content: [{ type: 'text', text: `Error: element "${elementId}" not found` }],
        isError: true,
      };
    }

    // Get worldbuilding data if applicable
    let worldbuildingData: Record<string, unknown> | null = null;
    let identityData: Record<string, unknown> | null = null;
    if (element.type === 'WORLDBUILDING') {
      const data = await getWorldbuildingData(ctx, username, slug, elementId);
      if (data) {
        worldbuildingData = data.worldbuilding;
        identityData = Object.keys(data.identity).length > 0 ? data.identity : null;
      }

      // Probe for image file if identity.image is not set
      if (!identityData?.image) {
        try {
          const storageBinding = ctx.env?.STORAGE as
            | Parameters<typeof getStorageService>[0]
            | undefined;
          const storageService = getStorageService(storageBinding);
          for (const ext of ['png', 'jpg']) {
            const imageFilename = `element-${elementId}.${ext}`;
            const exists = await storageService.projectFileExists(username, slug, imageFilename);
            if (exists) {
              if (!identityData) identityData = {};
              identityData.image = `media://${imageFilename}`;
              break;
            }
          }
        } catch {
          // Storage probe failed, skip — not critical
        }
      }
    }

    // Get relationships for this element using the runtime-aware helper
    let relationships: Array<Record<string, unknown>> = [];
    try {
      const allRelationships = await runtimeGetRelationships(ctx, username, slug);
      relationships = allRelationships
        .filter((r) => r.sourceElementId === elementId || r.targetElementId === elementId)
        .map((r) => ({ ...r }));
    } catch {
      // Relationships not available, that's ok
    }

    // Build parent path
    const elementMap = new Map(elements.map((e) => [e.id, e]));
    const path: string[] = [];
    let current = element;
    while (current.parentId) {
      const parent = elementMap.get(current.parentId);
      if (parent) {
        path.unshift(parent.name);
        current = parent;
      } else {
        break;
      }
    }

    // Deserialize metadata.tags from JSON string to array for MCP response
    const presentedMetadata = { ...element.metadata };
    if (presentedMetadata.tags) {
      try {
        presentedMetadata.tags = JSON.parse(presentedMetadata.tags);
      } catch {
        // Leave as-is if not valid JSON
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              element: {
                id: element.id,
                name: element.name,
                type: element.type,
                schemaId: element.schemaId,
                level: element.level,
                path: path.length > 0 ? path.join(' > ') : null,
                metadata: presentedMetadata,
              },
              worldbuilding: worldbuildingData,
              identity: identityData,
              relationships: relationships.length > 0 ? relationships : null,
            },
            null,
            2
          ),
        },
      ],
    };
  },
});

// ============================================
// get_document_content tool
// ============================================

registerTool({
  tool: {
    name: 'get_document_content',
    title: 'Get Document Content',
    description:
      'Get the prose content of a document element. Returns the text content from the ProseMirror editor.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'The ID of the document element',
        },
        format: {
          type: 'string',
          enum: ['text', 'xml'],
          description:
            'Output format: "text" for plain text, "xml" for ProseMirror XML (default: text)',
        },
      },
      required: ['project', 'elementId'],
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

    const elementId = String(args.elementId ?? '');
    const format = (args.format as string) ?? 'text';

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    // Verify element exists and is a document type
    const elements = await getElements(ctx, username, slug);
    const element = elements.find((e) => e.id === elementId);

    if (!element) {
      return {
        content: [{ type: 'text', text: `Error: element "${elementId}" not found` }],
        isError: true,
      };
    }

    // Get document content from Yjs
    const docId = `${username}:${slug}:${elementId}/`;
    try {
      const service = getYjsService(ctx);
      const sharedDoc = await service.getDocument(docId);

      // ProseMirror content is stored in an XmlFragment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = sharedDoc.doc as any;
      const xmlFragment = doc.getXmlFragment?.('prosemirror');

      if (!xmlFragment) {
        return {
          content: [
            {
              type: 'text',
              text: '(empty document - no content found)',
            },
          ],
          structuredContent: {
            elementId,
            elementName: element.name,
            format,
            content: '',
          },
        };
      }

      const xmlString = xmlFragment.toString();

      if (format === 'xml') {
        // Return XML representation
        return {
          content: [
            {
              type: 'text',
              text: xmlString,
            },
          ],
          structuredContent: {
            elementId,
            elementName: element.name,
            format: 'xml',
            content: xmlString,
          },
        };
      }

      // Extract text content - works with both real XmlFragment and our wrapper
      // On CF Workers, we get a string wrapper, so we parse the XML to extract text
      const textContent = isCloudflareWorkers(ctx)
        ? extractTextFromXmlString(xmlString)
        : extractTextFromXmlFragment(xmlFragment);

      return {
        content: [
          {
            type: 'text',
            text: textContent || '(empty document)',
          },
        ],
        structuredContent: {
          elementId,
          elementName: element.name,
          format: 'text',
          wordCount: textContent.split(/\s+/).filter((w) => w.length > 0).length,
          content: textContent,
        },
      };
    } catch (err) {
      mcpSearchLog.error('Error getting document content', err);
      return {
        content: [{ type: 'text', text: 'Error: could not retrieve document content' }],
        isError: true,
      };
    }
  },
});

/**
 * Extract plain text from a Yjs XmlFragment (ProseMirror content)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromXmlFragment(fragment: any): string {
  const parts: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function traverse(node: any) {
    if (!node) return;

    // Handle text nodes
    if (node.nodeType === 3 || typeof node.toString === 'function') {
      const text = node.toString?.() ?? '';
      // Yjs text nodes may be wrapped in XML-like syntax
      if (text && !text.startsWith('<')) {
        parts.push(text);
      }
    }

    // Handle element nodes with children
    if (node._content || node.content) {
      const content = node._content || node.content;
      if (Array.isArray(content)) {
        for (const child of content) {
          traverse(child);
        }
      }
    }

    // Handle Y.XmlFragment and Y.XmlElement
    if (typeof node.toArray === 'function') {
      const children = node.toArray();
      for (const child of children) {
        traverse(child);
      }
    }
  }

  traverse(fragment);

  return parts.join('\n').trim();
}

/**
 * Extract plain text from a ProseMirror XML string (for Cloudflare Workers)
 * Parses simple ProseMirror XML structure to extract text content
 */
function extractTextFromXmlString(xmlString: string): string {
  // Simple text extraction - strip all XML tags and decode entities
  // ProseMirror uses a simple XML format: <doc><paragraph>text</paragraph></doc>
  const text = xmlString
    // Replace paragraph/heading/blockquote boundaries with newlines
    .replace(/<\/(paragraph|heading|blockquote|listItem)>/gi, '\n')
    // Remove all other closing tags
    .replace(/<\/[^>]+>/g, '')
    // Remove all opening tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

// ============================================
// get_relationships_graph tool
// ============================================

registerTool({
  tool: {
    name: 'get_relationships_graph',
    title: 'Get Relationships Graph',
    description:
      'Get all relationships for a project as a graph structure, including backlinks. Useful for understanding how elements are connected.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        includeElementDetails: {
          type: 'boolean',
          description: 'Include full element details with each node (default: false)',
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

    const includeDetails = Boolean(args.includeElementDetails);

    // Get all elements
    const elements = await getElements(ctx, username, slug);
    const elementMap = new Map(elements.map((e) => [e.id, e]));

    // Get all relationships using the runtime-aware helper
    let allRelationships: Array<{
      id: string;
      sourceElementId: string;
      targetElementId: string;
      relationshipTypeId: string;
      note?: string;
    }> = [];

    try {
      allRelationships = await runtimeGetRelationships(ctx, username, slug);
    } catch {
      // No relationships
    }

    // Get relationship types
    let relationshipTypes: Array<{ id: string; name: string; description?: string }> = [];
    try {
      const schemaDocId = `${username}:${slug}:schema-library/`;
      const service = getYjsService(ctx);
      const schemaDoc = await service.getDocument(schemaDocId);
      const typesArray = schemaDoc.doc.getArray('relationshipTypes');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTypes: unknown[] = [];
      typesArray.forEach((value) => {
        if (value && typeof value === 'object') {
          rawTypes.push(value);
        }
      });
      relationshipTypes = rawTypes as typeof relationshipTypes;
    } catch {
      // No relationship types defined
    }

    const typeMap = new Map(relationshipTypes.map((t) => [t.id, t]));

    // Build graph nodes
    const nodesInGraph = new Set<string>();
    for (const rel of allRelationships) {
      nodesInGraph.add(rel.sourceElementId);
      nodesInGraph.add(rel.targetElementId);
    }

    const nodes = Array.from(nodesInGraph).map((id) => {
      const element = elementMap.get(id);
      if (includeDetails && element) {
        return {
          id,
          name: element.name,
          type: element.type,
          schemaId: element.schemaId,
        };
      }
      return {
        id,
        name: element?.name ?? 'Unknown',
        type: element?.type ?? 'Unknown',
      };
    });

    // Build edges with type names
    const edges = allRelationships.map((rel) => ({
      id: rel.id,
      source: rel.sourceElementId,
      target: rel.targetElementId,
      relationshipType: typeMap.get(rel.relationshipTypeId)?.name ?? rel.relationshipTypeId,
      note: rel.note,
    }));

    // Build adjacency list for convenience
    const adjacency: Record<string, { outgoing: string[]; incoming: string[] }> = {};
    for (const node of nodes) {
      adjacency[node.id] = { outgoing: [], incoming: [] };
    }
    for (const edge of edges) {
      if (adjacency[edge.source]) adjacency[edge.source].outgoing.push(edge.target);
      if (adjacency[edge.target]) adjacency[edge.target].incoming.push(edge.source);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Relationship graph: ${nodes.length} nodes, ${edges.length} edges`,
        },
      ],
      structuredContent: {
        nodes,
        edges,
        adjacency,
        relationshipTypes: relationshipTypes.map((t) => ({ id: t.id, name: t.name })),
      },
    };
  },
});

// ============================================
// get_project_metadata tool
// ============================================

registerTool({
  tool: {
    name: 'get_project_metadata',
    title: 'Get Project Metadata',
    description:
      'Get project metadata including title, description, author info, and settings stored in the project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
      },
      required: ['project'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_PROJECT],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_PROJECT);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    // Get project metadata from Yjs
    const docId = `${username}:${slug}:metadata/`;
    const service = getYjsService(ctx);

    const metadata: Record<string, unknown> = {};
    try {
      const sharedDoc = await service.getDocument(docId);
      const metadataMap = sharedDoc.doc.getMap('metadata');

      metadataMap.forEach((value, key) => {
        metadata[key] = convertYjsValue(value);
      });
    } catch {
      // No metadata document, return basic info
    }

    // Add basic project info
    const projectInfo = {
      username,
      slug,
      projectId,
      projectKey: `${username}/${slug}`,
      ...metadata,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(projectInfo, null, 2),
        },
      ],
      structuredContent: projectInfo,
    };
  },
});

// ============================================
// get_publish_plans tool
// ============================================

registerTool({
  tool: {
    name: 'get_publish_plans',
    title: 'Get Publish Plans',
    description:
      'Get all saved publish/export plans for a project. Publish plans define how content is organized for export (EPUB, PDF, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        planId: {
          type: 'string',
          description: 'Optional: get a specific plan by ID',
        },
      },
      required: ['project'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_PROJECT],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_PROJECT);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const planId = args.planId as string | undefined;

    // Get publish plans from Yjs
    const docId = `${username}:${slug}:publish-plans/`;
    const service = getYjsService(ctx);

    try {
      const sharedDoc = await service.getDocument(docId);
      const plansArray = sharedDoc.doc.getArray('plans');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allPlans = (plansArray as any).toJSON?.() ?? [];

      if (planId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const plan = allPlans.find((p: any) => p.id === planId);
        if (!plan) {
          return {
            content: [{ type: 'text', text: `Error: publish plan "${planId}" not found` }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(plan, null, 2),
            },
          ],
          structuredContent: plan,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${allPlans.length} publish plan(s)`,
          },
        ],
        structuredContent: {
          total: allPlans.length,
          plans: allPlans,
        },
      };
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: 'No publish plans found',
          },
        ],
        structuredContent: {
          total: 0,
          plans: [],
        },
      };
    }
  },
});

export {};
