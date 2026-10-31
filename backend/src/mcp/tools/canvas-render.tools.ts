/**
 * MCP Tools: Seeing a canvas
 *
 * `render_canvas` shows an agent what it drew, and `save_canvas_image` keeps the
 * result as project media, for instance to make it the project cover. Both draw
 * on the server (`services/canvas-render/`), so they need no browser. The browser
 * tool of the same name draws with the app's own renderer instead.
 */
import {
  describeCanvasRender,
  planCanvasRender,
  RENDER_CANVAS_DESCRIPTION,
  RENDER_CANVAS_PROPERTIES,
} from '@inkweld/canvas';
import { nanoid } from 'nanoid';
import { registerTool } from '../mcp.handler';
import type { McpContext, McpToolResult } from '../mcp.types';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import { QuotaExceededError } from '../../errors';
import type { CanvasMediaSource } from '../../services/canvas-render/images';
import {
  type CanvasRenderResult,
  CanvasRenderUnavailableError,
  loadCanvasFontSet,
  renderCanvasToPng,
} from '../../services/canvas-render/renderer';
import { logger } from '../../services/logger.service';
import { projectService } from '../../services/project.service';
import { quotaService } from '../../services/quota.service';
import { getStorageService } from '../../services/storage.service';
import { rethrowDocumentReadError } from '../../services/yjs-worker.service';
import type { DatabaseInstance } from '../../types/context';
import { canvasToolProperties, errorResult, openCanvas, readElementId } from './canvas.tools';
import { parseProjectParam } from './search.tools';

const mcpRenderLog = logger.child('MCP-CanvasRender');

function projectStorage(ctx: McpContext) {
  return getStorageService(ctx.env?.STORAGE as Parameters<typeof getStorageService>[0] | undefined);
}

function mediaSource(ctx: McpContext, username: string, slug: string): CanvasMediaSource {
  const storage = projectStorage(ctx);
  return {
    read: async (filename) => {
      const data = await storage.readProjectFile(username, slug, filename);
      return data ? new Uint8Array(data) : null;
    },
    findByMediaId: async (mediaId) => {
      const files = await storage.listProjectFiles(username, slug, `${mediaId}.`);
      return files[0]?.filename ?? null;
    },
  };
}

interface CanvasRenderOutcome extends CanvasRenderResult {
  details: Record<string, unknown>;
}

/** Find the canvas and draw it. An `{ error }` is for the agent to read. */
async function renderForTool(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string,
  args: Record<string, unknown>
): Promise<CanvasRenderOutcome | { error: string }> {
  const canvas = await openCanvas(ctx, username, slug, elementId);
  if ('error' in canvas) return canvas;

  const fonts = await loadCanvasFontSet();
  const plan = planCanvasRender(canvas.contents, args, fonts.measure);
  if ('error' in plan) return plan;

  const result = await renderCanvasToPng(
    canvas.contents,
    plan,
    fonts,
    mediaSource(ctx, username, slug)
  );
  return {
    ...result,
    details: describeCanvasRender(elementId, canvas.element.name, plan, result.warnings),
  };
}

/** Run a render, turning what can go wrong into something the agent can read. */
async function withRenderErrors(
  action: string,
  run: () => Promise<McpToolResult>
): Promise<McpToolResult> {
  try {
    return await run();
  } catch (err) {
    rethrowDocumentReadError(err);
    if (err instanceof CanvasRenderUnavailableError) return errorResult(err.message);
    if (err instanceof QuotaExceededError) {
      return errorResult(
        `the project owner's sync capacity is full (${err.usedBytes} of ${err.quotaBytes} bytes used).`
      );
    }
    mcpRenderLog.error(`Error ${action}`, err);
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`could not ${action}: ${message}`);
  }
}

const inputSchema = {
  type: 'object' as const,
  properties: {
    ...canvasToolProperties,
    ...RENDER_CANVAS_PROPERTIES,
  },
  required: ['project', 'elementId'],
};

registerTool({
  tool: {
    name: 'render_canvas',
    title: 'Render Canvas',
    description: `${RENDER_CANVAS_DESCRIPTION}

The server draws this image as a close preview: text in the fonts that ship with Inkweld matches the app, but kerning and antialiasing differ slightly. A web browser's own render is the final word.`,
    inputSchema,
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

    return withRenderErrors('render the canvas', async () => {
      const outcome = await renderForTool(ctx, username, slug, elementId, args);
      if ('error' in outcome) return errorResult(outcome.error);
      return {
        content: [
          { type: 'text', text: JSON.stringify(outcome.details, null, 2) },
          {
            type: 'image',
            data: Buffer.from(outcome.png).toString('base64'),
            mimeType: 'image/png',
          },
        ],
        structuredContent: outcome.details,
      };
    });
  },
});

registerTool({
  tool: {
    name: 'save_canvas_image',
    title: 'Save Canvas Image',
    description: `Draw a canvas as render_canvas does, and keep the PNG in the project's media. Use the mediaUrl it returns wherever an image goes: for example, apply_image with source "media" and target "projectCover" makes it the project cover.

Takes the same arguments as render_canvas. Use a larger maxSize for an image people will see: a cover wants the longest side at 2048.`,
    inputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
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

    return withRenderErrors('save the canvas image', async () => {
      const outcome = await renderForTool(ctx, username, slug, elementId, args);
      if ('error' in outcome) return errorResult(outcome.error);

      const project = await projectService.findById(db, projectId);
      if (project) {
        await quotaService.assertCanStore(
          db,
          project.userId,
          outcome.png.byteLength,
          'media_upload',
          {
            r2: ctx.env?.STORAGE as never,
            env: ctx.env as never,
            authToken: ctx.authToken,
          }
        );
      }
      const filename = `img-${nanoid()}.png`;
      await projectStorage(ctx).saveProjectFile(username, slug, filename, outcome.png, 'image/png');

      const summary = {
        ...outcome.details,
        mediaUrl: `media://${filename}`,
        sizeBytes: outcome.png.byteLength,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        structuredContent: summary,
      };
    });
  },
});
