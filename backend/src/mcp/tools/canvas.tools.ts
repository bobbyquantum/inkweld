/**
 * MCP Tools: Canvas contents
 *
 * `get_canvas` reads a canvas element and `edit_canvas` changes it. Canvases
 * live in the `canvases` map of the project's elements document, one entry per
 * object, so an edit here merges with anyone drawing at the same time and shows
 * up in open canvas tabs like another collaborator's.
 *
 * What the tools accept and return is shared with the browser's WebMCP tools
 * in `@inkweld/canvas`; this file only does the storage. Runtime-aware through
 * `openEditableDocument`.
 */
import {
  CANVAS_CONFIG_META_KEY,
  describeCanvas,
  describeCanvasEdit,
  EDIT_CANVAS_DESCRIPTION,
  EDIT_CANVAS_PROPERTIES,
  GET_CANVAS_DESCRIPTION,
  GET_CANVAS_PROPERTIES,
  mirrorCanvasToElement,
  planCanvasEdit,
  readCanvasContents,
  resolveCanvasContents,
  seedCanvasEdit,
  writeCanvasEdit,
  writeCanvasLinks,
  type CanvasContents,
} from '@inkweld/canvas';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';
import { registerTool } from '../mcp.handler';
import type { McpContext, McpToolResult } from '../mcp.types';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import type { DatabaseInstance } from '../../types/context';
import type { Element } from '../../schemas/element.schemas';
import { activityService } from '../../services/activity.service';
import { logger } from '../../services/logger.service';
import { getStorageService } from '../../services/storage.service';
import { openEditableDocument, type EditableDocument } from '../../services/yjs-document-access';
import { rethrowDocumentReadError } from '../../services/yjs-worker.service';
import { parseProjectParam } from './search.tools';

const mcpCanvasLog = logger.child('MCP-Canvas');

const projectProperty = {
  type: 'string',
  description:
    'Project identifier in "username/slug" format. Use list_projects to discover projects.',
} as const;

const elementIdProperty = {
  type: 'string',
  description: 'ID of the CANVAS element. Create one with create_element, type CANVAS.',
} as const;

export function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

interface OpenCanvas {
  editable: EditableDocument;
  element: Element;
  elements: Element[];
  contents: CanvasContents;
  needsSeed: boolean;
}

/** Open the project's elements document and find a canvas in it. */
export async function openCanvas(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string
): Promise<OpenCanvas | { error: string }> {
  const editable = await openEditableDocument(`${username}:${slug}:elements/`, {
    env: ctx.env,
    authToken: ctx.authToken,
  });
  const elements = editable.doc.getArray<Element>('elements').toArray();
  const element = elements.find((e) => e.id === elementId);
  if (!element) return { error: `element "${elementId}" not found` };
  if (element.type !== 'CANVAS') {
    return { error: `element "${elementId}" is type "${element.type}", not CANVAS` };
  }
  const { contents, needsSeed } = resolveCanvasContents(
    readCanvasContents(editable.doc, elementId),
    element.metadata?.[CANVAS_CONFIG_META_KEY]
  );
  return { editable, element, elements, contents, needsSeed };
}

export function readElementId(args: Record<string, unknown>): string {
  return (typeof args.elementId === 'string' ? args.elementId : '').trim();
}

/** The arguments every canvas tool takes. */
export const canvasToolProperties = {
  project: projectProperty,
  elementId: elementIdProperty,
};

// ============================================
// get_canvas tool
// ============================================

registerTool({
  tool: {
    name: 'get_canvas',
    title: 'Get Canvas',
    description: GET_CANVAS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        ...canvasToolProperties,
        ...GET_CANVAS_PROPERTIES,
      },
      required: ['project', 'elementId'],
    },
    annotations: { readOnlyHint: true },
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

    const elementId = readElementId(args);
    if (!elementId) return errorResult('elementId is required');

    try {
      const canvas = await openCanvas(ctx, username, slug, elementId);
      if ('error' in canvas) return errorResult(canvas.error);

      const view = describeCanvas(elementId, canvas.element.name, canvas.contents, args);
      if ('error' in view) return errorResult(String(view.error));
      return {
        content: [{ type: 'text', text: JSON.stringify(view, null, 2) }],
        structuredContent: view,
      };
    } catch (err) {
      rethrowDocumentReadError(err);
      mcpCanvasLog.error('Error reading canvas', err);
      return errorResult('could not read the canvas');
    }
  },
});

// ============================================
// edit_canvas tool
// ============================================

/**
 * The placed media files that are not in the project. An agent's typo would
 * otherwise only show up as an image that never loads.
 */
async function findMissingMedia(
  ctx: McpContext,
  username: string,
  slug: string,
  references: string[]
): Promise<string[]> {
  const storage = getStorageService(
    ctx.env?.STORAGE as Parameters<typeof getStorageService>[0] | undefined
  );
  const found = await Promise.all(
    references.map(async (ref) => {
      if (ref.startsWith('media://')) {
        return storage.projectFileExists(username, slug, ref.substring('media://'.length));
      }
      // `media:<id>` is a file with that name and any extension.
      const files = await storage.listProjectFiles(
        username,
        slug,
        `${ref.substring('media:'.length)}.`
      );
      return files.length > 0;
    })
  );
  return references.filter((_, index) => !found[index]);
}

registerTool({
  tool: {
    name: 'edit_canvas',
    title: 'Edit Canvas',
    description: `${EDIT_CANVAS_DESCRIPTION}

To place an image from a file on disk, call create_media_upload first, upload the file to the URL it returns, and use its mediaUrl as src.`,
    inputSchema: {
      type: 'object',
      properties: {
        ...canvasToolProperties,
        ...EDIT_CANVAS_PROPERTIES,
      },
      required: ['project', 'elementId'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    db: DatabaseInstance,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    const elementId = readElementId(args);
    if (!elementId) return errorResult('elementId is required');

    try {
      const canvas = await openCanvas(ctx, username, slug, elementId);
      if ('error' in canvas) return errorResult(canvas.error);
      const { editable, element, elements, contents, needsSeed } = canvas;

      const plan = planCanvasEdit(contents, args, {
        canvasElementId: elementId,
        createId: nanoid,
        elementExists: (id) => elements.some((e) => e.id === id),
      });
      if ('error' in plan) return errorResult(plan.error);

      const missing = await findMissingMedia(ctx, username, slug, plan.placedMedia);
      if (missing.length > 0) {
        return errorResult(
          `not in the project's media: ${missing.join(', ')}. Use list_project_media, or upload with create_media_upload.`
        );
      }

      const doc = editable.doc;
      doc.transact(() => {
        // Without the seed, the edit's layers would make the canvas look
        // populated and the contents still in its metadata would be lost.
        if (needsSeed) writeCanvasEdit(Y, doc, elementId, seedCanvasEdit(contents));
        writeCanvasEdit(Y, doc, elementId, plan.edit);
        writeCanvasLinks(
          doc,
          elementId,
          plan.linksToCreate,
          plan.relationshipsToRemove,
          new Date().toISOString()
        );
        // Browsers only mirror their own edits, so this one is mirrored here
        // for the archives, templates and media-usage scan that read it.
        mirrorCanvasToElement(doc, elementId);
      });
      await editable.commit();

      await activityService.recordOrCoalesceEdit(db, {
        projectId,
        userId: ctx.userId,
        entityId: elementId,
        entityName: element.name,
        wordsDelta: 0,
        endWordCount: 0,
        durationMs: 0,
        metadata: { source: 'mcp', format: 'canvas' },
      });

      const summary = describeCanvasEdit(elementId, element.name, plan);
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    } catch (err) {
      rethrowDocumentReadError(err);
      mcpCanvasLog.error('Error editing canvas', err);
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`could not edit the canvas: ${message}`);
    }
  },
});
