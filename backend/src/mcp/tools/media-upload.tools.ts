/**
 * MCP Tools: Uploading media from disk
 *
 * A tool argument has to pass through the conversation, which rules out
 * anything but a very small image. `create_media_upload` hands out a short-lived
 * URL instead, so an agent can send a file with its own HTTP tool and the bytes
 * never enter its context. The URL is served by `routes/mcp-upload.routes.ts`.
 */
import { nanoid } from 'nanoid';
import { registerTool } from '../mcp.handler';
import { MAX_MEDIA_UPLOAD_BYTES } from '../../utils/upload';
import { MEDIA_UPLOAD_TOKEN_TTL_SECONDS, signMediaUploadToken } from '../media-upload-token';
import type { McpContext, McpToolResult } from '../mcp.types';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import { parseProjectParam } from './search.tools';

/** File extension for each format the upload route accepts. */
const FORMAT_EXTENSIONS: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
};

function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

registerTool({
  tool: {
    name: 'create_media_upload',
    title: 'Create Media Upload',
    description: `Get a URL for uploading an image file to a project's media, so its bytes do not have to pass through this conversation. Use it for any image on disk.

PUT the file to uploadUrl with your HTTP tool, for example: curl --fail --upload-file picture.png "<uploadUrl>". No other authentication is needed. The URL works once, for ${MEDIA_UPLOAD_TOKEN_TTL_SECONDS / 60} minutes, and the file must really be in the format you name.

Then use mediaUrl wherever an image goes: as src of an image in edit_canvas, or as mediaUrl with source "media" in apply_image.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description:
            'Project identifier in "username/slug" format. Use list_projects to discover projects.',
        },
        format: {
          type: 'string',
          enum: Object.keys(FORMAT_EXTENSIONS),
          description: 'The format of the file you will upload.',
        },
      },
      required: ['project', 'format'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username: owner, slug, projectId } = result.project;

    const extension = typeof args.format === 'string' ? FORMAT_EXTENSIONS[args.format] : undefined;
    if (!extension) {
      return errorResult(`format must be one of: ${Object.keys(FORMAT_EXTENSIONS).join(', ')}`);
    }
    if (!ctx.requestOrigin) return errorResult('this server cannot issue upload URLs');

    const filename = `img-${nanoid()}.${extension}`;
    const { token, expiresAt } = await signMediaUploadToken(
      {
        userId: ctx.userId,
        username: ctx.username,
        sessionId: ctx.sessionId,
        projectId,
        owner,
        slug,
        filename,
      },
      ctx.env
    );

    const payload = {
      uploadUrl: `${ctx.requestOrigin}/api/v1/ai/mcp/uploads/${token}`,
      method: 'PUT',
      mediaUrl: `media://${filename}`,
      expiresAt: expiresAt.toISOString(),
      maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
