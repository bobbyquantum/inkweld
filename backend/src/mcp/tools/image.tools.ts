/**
 * MCP Tools: Image Generation and Management
 *
 * Tools for generating images via AI and assigning them to worldbuilding elements.
 *
 * Runtime-aware: Works on both Bun (LevelDB) and Cloudflare Workers (DO HTTP API).
 */

import { registerTool } from '../mcp.handler';
import type { McpContext, McpToolResult, ActiveProjectContext } from '../mcp.types';
import { getProjectByKey, hasProjectPermission } from '../mcp.types';
import { MCP_PERMISSIONS } from '../../services/mcp-key.service';
import { lookup } from 'mime-types';
import { imageGenerationService } from '../../services/image-generation.service';
import { imageProfileService } from '../../services/image-profile.service';
import { imageService } from '../../services/image.service';
import { projectService } from '../../services/project.service';
import { getStorageService } from '../../services/storage.service';
import { updateWorldbuilding, updateProjectMetaCoverMediaId } from './yjs-runtime';
import type {
  ImageProviderType,
  ImageSize,
  ResolvedImageRequest,
} from '../../types/image-generation';
import type { DatabaseInstance } from '../../types/context';
import { logger } from '../../services/logger.service';

const mcpImageLog = logger.child('MCP-Image');

// ============================================
// Helper functions
// ============================================

/** Safely extract a string from an unknown MCP argument, avoiding Object.toString() */
function stringArg(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

/** Safely extract an optional string from an unknown MCP argument */
function optionalStringArg(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Resolve the output mode based on detected MIME type */
function resolveOutputMode(mode: string, mimeType: string): string {
  if (mode !== 'auto') return mode;
  if (mimeType.startsWith('image/')) return 'image';
  if (isTextLikeMime(mimeType)) return 'text';
  return 'base64';
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
  const projectStr = stringArg(projectArg);

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

function toBuffer(data: Buffer | ArrayBuffer): Buffer {
  return data instanceof Buffer ? data : Buffer.from(new Uint8Array(data));
}

function parseMediaFilename(
  mediaUrl: string | undefined,
  filename: string | undefined
): string | null {
  const mediaUrlValue = mediaUrl?.trim();
  const filenameValue = filename?.trim();

  let resolved: string | null = null;
  if (mediaUrlValue) {
    if (!mediaUrlValue.startsWith('media://')) {
      return null;
    }
    resolved = mediaUrlValue.substring('media://'.length);
  } else if (filenameValue) {
    resolved = filenameValue;
  }

  if (!resolved) {
    return null;
  }

  if (resolved.includes('/') || resolved.includes('\\') || resolved.includes('..')) {
    return null;
  }

  return resolved;
}

function isTextLikeMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/x-javascript' ||
    mimeType === 'application/markdown'
  );
}

function isMediaFile(filename: string, mimeType?: string): boolean {
  if (!mimeType) {
    return /\.(jpg|jpeg|png|gif|webp|svg|mp3|mp4|wav|ogg|pdf|epub|html|md)$/i.test(filename);
  }

  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/epub+zip' ||
    mimeType === 'text/html' ||
    mimeType === 'text/markdown'
  );
}

function getStorageServiceForContext(ctx: McpContext) {
  const storageBinding = ctx.env?.STORAGE as Parameters<typeof getStorageService>[0] | undefined;
  return getStorageService(storageBinding);
}

interface GenerationMeta {
  revisedPrompt?: string;
  profileId?: string;
  provider?: string;
  model?: string;
}

interface AcquiredImage {
  buffer: Buffer;
  mimeType: string;
  meta: GenerationMeta;
}

interface ImageContext {
  db: unknown;
  ctx: McpContext;
  storageService: ReturnType<typeof getStorageService>;
  username: string;
  slug: string;
}

type AcquireResult = { image: AcquiredImage } | { error: McpToolResult };

async function acquireFromGenerate(
  args: Record<string, unknown>,
  db: unknown,
  target: string
): Promise<AcquireResult> {
  const prompt = stringArg(args.prompt);
  const profileId = stringArg(args.profileId);

  if (!prompt) {
    return {
      error: {
        content: [{ type: 'text', text: 'Error: prompt is required for source "generate"' }],
        isError: true,
      },
    };
  }
  if (!profileId) {
    return {
      error: {
        content: [{ type: 'text', text: 'Error: profileId is required for source "generate"' }],
        isError: true,
      },
    };
  }

  const isAvailable = await imageGenerationService.isAvailable(db as DatabaseInstance);
  if (!isAvailable) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: 'Error: No image generation provider is available. Please configure an AI image provider.',
          },
        ],
        isError: true,
      },
    };
  }

  const profile = await resolveImageProfile(db as DatabaseInstance, profileId);
  if (!profile) {
    return {
      error: {
        content: [{ type: 'text', text: 'Error: No enabled image profile found.' }],
        isError: true,
      },
    };
  }

  // defaultSize is text() in schema → string | null; cast needed to narrow to ImageSize union
  const size: ImageSize =
    target === 'projectCover' ? '1248x832' : ((profile.defaultSize || '1024x1024') as ImageSize);

  const request: ResolvedImageRequest = {
    prompt,
    profileId: profile.id,
    provider: profile.provider as ImageProviderType,
    model: profile.modelId,
    size,
    n: 1,
    options: profile.modelConfig || undefined,
  };

  const genResult = await imageGenerationService.generate(db as DatabaseInstance, request);

  if (!genResult.data || genResult.data.length === 0) {
    return {
      error: {
        content: [{ type: 'text', text: 'Error: No images were generated' }],
        isError: true,
      },
    };
  }

  const image = genResult.data[0];
  if (!image.b64Json) {
    return {
      error: {
        content: [{ type: 'text', text: 'Error: No base64 image data returned' }],
        isError: true,
      },
    };
  }

  return {
    image: {
      buffer: Buffer.from(image.b64Json, 'base64'),
      mimeType: 'image/png',
      meta: {
        revisedPrompt: image.revisedPrompt,
        profileId: profile.id,
        provider: genResult.provider,
        model: genResult.model,
      },
    },
  };
}

function acquireFromUpload(args: Record<string, unknown>): AcquireResult {
  let rawBase64 = stringArg(args.base64Data);

  if (!rawBase64) {
    return {
      error: {
        content: [{ type: 'text', text: 'Error: base64Data is required for source "upload"' }],
        isError: true,
      },
    };
  }

  let mimeType = 'image/png';
  if (rawBase64.startsWith('data:')) {
    const matches = /^data:(image\/[^;]+);base64,(.+)$/.exec(rawBase64);
    if (matches) {
      mimeType = matches[1];
      rawBase64 = matches[2];
    } else {
      const commaIndex = rawBase64.indexOf(',');
      if (commaIndex > 0) {
        rawBase64 = rawBase64.substring(commaIndex + 1);
      }
    }
  }

  return { image: { buffer: Buffer.from(rawBase64, 'base64'), mimeType, meta: {} } };
}

async function acquireFromMedia(
  args: Record<string, unknown>,
  storageService: ReturnType<typeof getStorageService>,
  username: string,
  slug: string
): Promise<AcquireResult> {
  const mediaUrlArg = stringArg(args.mediaUrl);
  const filename = parseMediaFilename(mediaUrlArg, undefined);

  if (!filename) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: 'Error: mediaUrl is required for source "media" (e.g. media://cover.jpg)',
          },
        ],
        isError: true,
      },
    };
  }

  const exists = await storageService.projectFileExists(username, slug, filename);
  if (!exists) {
    return {
      error: {
        content: [{ type: 'text', text: `Error: media file not found: ${filename}` }],
        isError: true,
      },
    };
  }

  const data = await storageService.readProjectFile(username, slug, filename);
  if (!data) {
    return {
      error: {
        content: [{ type: 'text', text: `Error: media file is empty: ${filename}` }],
        isError: true,
      },
    };
  }

  return {
    image: {
      buffer: toBuffer(data),
      mimeType: String(lookup(filename) || 'image/png'),
      meta: {},
    },
  };
}

async function applyToProjectCover(
  ic: ImageContext,
  projectId: string,
  imageBuffer: Buffer,
  source: string,
  generationMeta: GenerationMeta
): Promise<McpToolResult> {
  const validation = await imageService.validateImage(imageBuffer);
  if (!validation.valid) {
    return {
      content: [{ type: 'text', text: `Error: Invalid image - ${validation.error}` }],
      isError: true,
    };
  }

  const processedImage = await imageService.processCoverImage(imageBuffer);
  const savedFilename = `cover-${Date.now()}.jpg`;
  const savedMediaUrl = `media://${savedFilename}`;

  // Delete old cover file if it exists
  const project = await projectService.findByUsernameAndSlug(
    ic.db as DatabaseInstance,
    ic.username,
    ic.slug
  );
  if (project?.coverImage && project.coverImage !== savedFilename) {
    try {
      await ic.storageService.deleteProjectFile(ic.username, ic.slug, project.coverImage);
    } catch {
      // Old file may not exist, that's fine
    }
  }

  await ic.storageService.saveProjectFile(
    ic.username,
    ic.slug,
    savedFilename,
    processedImage,
    'image/jpeg'
  );
  await projectService.update(ic.db as DatabaseInstance, projectId, { coverImage: savedFilename });

  // Update Yjs projectMeta so connected clients see the new cover immediately
  const coverMediaId = savedFilename.replace(/\.[^.]+$/, '');
  try {
    await updateProjectMetaCoverMediaId(ic.ctx, ic.username, ic.slug, coverMediaId);
  } catch {
    mcpImageLog.warn('Failed to update Yjs coverMediaId (cover saved successfully)');
  }

  return {
    content: [
      {
        type: 'text',
        text: `Set project cover image: ${savedFilename} (${Math.round(processedImage.length / 1024)}KB)`,
      },
    ],
    structuredContent: {
      success: true,
      source,
      target: 'projectCover',
      filename: savedFilename,
      mediaUrl: savedMediaUrl,
      sizeBytes: processedImage.length,
      ...generationMeta,
    },
  };
}

async function applyToElementImage(
  ic: ImageContext,
  elementId: string,
  imageBuffer: Buffer,
  imageMimeType: string,
  source: string,
  generationMeta: GenerationMeta
): Promise<McpToolResult> {
  const extension = imageMimeType === 'image/jpeg' ? 'jpg' : 'png';
  const savedFilename = `element-${elementId}.${extension}`;
  const savedMediaUrl = `media://${savedFilename}`;

  await ic.storageService.saveProjectFile(
    ic.username,
    ic.slug,
    savedFilename,
    imageBuffer,
    imageMimeType
  );
  await updateWorldbuilding(
    ic.ctx,
    ic.username,
    ic.slug,
    elementId,
    { image: savedMediaUrl },
    'identity'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Set image for element "${elementId}": ${savedFilename} (${Math.round(imageBuffer.length / 1024)}KB)`,
      },
    ],
    structuredContent: {
      success: true,
      source,
      target: 'elementImage',
      elementId,
      filename: savedFilename,
      mediaUrl: savedMediaUrl,
      sizeBytes: imageBuffer.length,
      ...generationMeta,
    },
  };
}

async function saveAndReturnImage(
  ic: ImageContext,
  imageBuffer: Buffer,
  imageMimeType: string,
  source: string,
  generationMeta: GenerationMeta
): Promise<McpToolResult> {
  const extension = imageMimeType === 'image/jpeg' ? 'jpg' : 'png';
  const savedFilename = `generated-${Date.now()}.${extension}`;
  const savedMediaUrl = `media://${savedFilename}`;

  await ic.storageService.saveProjectFile(
    ic.username,
    ic.slug,
    savedFilename,
    imageBuffer,
    imageMimeType
  );
  const base64 = imageBuffer.toString('base64');

  return {
    content: [
      {
        type: 'text',
        text: `Image ready: ${savedFilename} (${Math.round(imageBuffer.length / 1024)}KB)`,
      },
      ...(imageMimeType.startsWith('image/')
        ? [{ type: 'image' as const, data: base64, mimeType: imageMimeType }]
        : []),
    ],
    structuredContent: {
      success: true,
      source,
      target: 'none',
      filename: savedFilename,
      mediaUrl: savedMediaUrl,
      sizeBytes: imageBuffer.length,
      ...generationMeta,
    },
  };
}

async function resolveImageProfile(
  db: DatabaseInstance,
  profileId: string
): Promise<Awaited<ReturnType<typeof imageProfileService.getFirstEnabled>>> {
  const selectedProfile = await imageProfileService.getById(db, profileId);
  if (!selectedProfile) {
    throw new Error(`Image profile not found: ${profileId}`);
  }
  if (!selectedProfile.enabled) {
    throw new Error(`Image profile is disabled: ${profileId}`);
  }
  return selectedProfile;
}

// ============================================
// list_project_media tool
// ============================================

registerTool({
  tool: {
    name: 'list_project_media',
    title: 'List Project Media',
    description:
      'List media files in a project and return media:// URLs for use with get_media_content.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        prefix: {
          type: 'string',
          description: 'Optional filename prefix filter (for example: "element-" or "cover").',
        },
        includeNonMedia: {
          type: 'boolean',
          description: 'Include non-media files in results. Default false.',
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

    const prefix = optionalStringArg(args.prefix);
    const includeNonMedia = Boolean(args.includeNonMedia);

    try {
      const storageService = getStorageServiceForContext(ctx);
      const files = await storageService.listProjectFiles(username, slug, prefix);

      const filtered = includeNonMedia
        ? files
        : files.filter((file) => isMediaFile(file.filename, file.mimeType));

      const items = filtered.map((file) => ({
        filename: file.filename,
        mediaUrl: `media://${file.filename}`,
        size: file.size,
        mimeType: file.mimeType,
        uploadedAt: file.uploadedAt?.toISOString(),
      }));

      const summary = items
        .slice(0, 15)
        .map((item) => `- ${item.mediaUrl} (${item.mimeType || 'unknown'}, ${item.size} bytes)`)
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text:
              `Found ${items.length} file(s) in ${username}/${slug}${includeNonMedia ? '' : ' (media only)'}.` +
              (summary ? `\n${summary}` : ''),
          },
        ],
        structuredContent: {
          success: true,
          project: `${username}/${slug}`,
          prefix: prefix ?? null,
          includeNonMedia,
          total: items.length,
          items,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error listing project media', err);
      return {
        content: [{ type: 'text', text: `Error listing project media: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// list_image_profiles tool
// ============================================

registerTool({
  tool: {
    name: 'list_image_profiles',
    title: 'List Image Profiles',
    description:
      'List enabled image generation profiles with profile IDs to use in generate_image and related tools.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_PROJECT],
  async execute(
    _ctx: McpContext,
    db: unknown,
    _args: Record<string, unknown>
  ): Promise<McpToolResult> {
    try {
      const profiles = await imageProfileService.listEnabled(db as DatabaseInstance);

      const summary = profiles
        .slice(0, 20)
        .map((profile) => {
          const sizeInfo = profile.defaultSize ? `, default ${profile.defaultSize}` : '';
          return `- ${profile.id}: ${profile.name} (${profile.provider}/${profile.modelId}${sizeInfo})`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Enabled image profiles: ${profiles.length}` + (summary ? `\n${summary}` : ''),
          },
        ],
        structuredContent: {
          success: true,
          total: profiles.length,
          profiles,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error listing image profiles', err);
      return {
        content: [{ type: 'text', text: `Error listing image profiles: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// get_media_content tool
// ============================================

registerTool({
  tool: {
    name: 'get_media_content',
    title: 'Get Media Content',
    description:
      'Read project media content by media:// URL or filename. Returns image data, text content, or base64 bytes.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        mediaUrl: {
          type: 'string',
          description: 'Media URL in media://filename.ext format',
        },
        filename: {
          type: 'string',
          description: 'Alternative to mediaUrl: raw filename in project media storage',
        },
        as: {
          type: 'string',
          enum: ['auto', 'image', 'text', 'base64'],
          description:
            'Output format. auto = image for image/*, text for text-like MIME, otherwise base64.',
        },
        maxBytes: {
          type: 'number',
          description:
            'Maximum bytes to return (default: 262144). Request fails if file exceeds this limit.',
        },
      },
      required: ['project'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_ELEMENTS, MCP_PERMISSIONS.READ_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const mediaUrl = optionalStringArg(args.mediaUrl);
    const filenameArg = optionalStringArg(args.filename);
    const outputMode = stringArg(args.as, 'auto');
    const maxBytes = Number(args.maxBytes ?? 262144);

    const filename = parseMediaFilename(mediaUrl, filenameArg);
    if (!filename) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: provide a valid mediaUrl (media://...) or filename',
          },
        ],
        isError: true,
      };
    }

    if (!['auto', 'image', 'text', 'base64'].includes(outputMode)) {
      return {
        content: [{ type: 'text', text: 'Error: as must be one of auto, image, text, base64' }],
        isError: true,
      };
    }

    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      return {
        content: [{ type: 'text', text: 'Error: maxBytes must be a positive number' }],
        isError: true,
      };
    }

    try {
      const storageService = getStorageServiceForContext(ctx);
      const exists = await storageService.projectFileExists(username, slug, filename);
      if (!exists) {
        return {
          content: [{ type: 'text', text: `Error: media file not found: ${filename}` }],
          isError: true,
        };
      }

      const data = await storageService.readProjectFile(username, slug, filename);
      if (!data) {
        return {
          content: [{ type: 'text', text: `Error: media file is empty: ${filename}` }],
          isError: true,
        };
      }

      const buffer = toBuffer(data);
      if (buffer.length > maxBytes) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: media file is ${buffer.length} bytes, exceeding maxBytes=${maxBytes}`,
            },
          ],
          isError: true,
        };
      }

      const mimeType = String(lookup(filename) || 'application/octet-stream');
      const base64 = buffer.toString('base64');
      const resolvedMode = resolveOutputMode(outputMode, mimeType);

      if (resolvedMode === 'image') {
        if (!mimeType.startsWith('image/')) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: file is ${mimeType}, not an image`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Loaded image media://${filename} (${buffer.length} bytes, ${mimeType})`,
            },
            {
              type: 'image',
              data: base64,
              mimeType,
            },
          ],
          structuredContent: {
            success: true,
            filename,
            mediaUrl: `media://${filename}`,
            mimeType,
            sizeBytes: buffer.length,
            mode: 'image',
          },
        };
      }

      if (resolvedMode === 'text') {
        const text = buffer.toString('utf-8');
        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
          structuredContent: {
            success: true,
            filename,
            mediaUrl: `media://${filename}`,
            mimeType,
            sizeBytes: buffer.length,
            mode: 'text',
          },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Loaded binary media://${filename} (${buffer.length} bytes, ${mimeType}) as base64`,
          },
        ],
        structuredContent: {
          success: true,
          filename,
          mediaUrl: `media://${filename}`,
          mimeType,
          sizeBytes: buffer.length,
          mode: 'base64',
          base64,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error loading media content', err);
      return {
        content: [{ type: 'text', text: `Error loading media content: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// apply_image tool — unified image endpoint
// ============================================

registerTool({
  tool: {
    name: 'apply_image',
    title: 'Apply Image',
    description: `Unified image tool: generate, upload, or reference an existing media file — and optionally assign it to a project cover or element image.

**source** controls where the image comes from:
- \`generate\` — generate via AI (requires \`profileId\` and \`prompt\`)
- \`upload\` — provide raw base64 data (requires \`base64Data\`)
- \`media\` — reference an existing project media file (requires \`mediaUrl\`, e.g. \`media://cover.jpg\`)

**target** controls what happens with the image:
- \`projectCover\` — set as the project cover image
- \`elementImage\` — set as a worldbuilding element's image (requires \`elementId\`)
- omit or \`none\` — just generate/upload and return the result without assigning`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        source: {
          type: 'string',
          enum: ['generate', 'upload', 'media'],
          description:
            'Where the image comes from: generate (AI), upload (base64), or media (existing file).',
        },
        target: {
          type: 'string',
          enum: ['projectCover', 'elementImage', 'none'],
          description:
            'Where to apply the image. Omit or use "none" to just return the image without assigning it.',
        },
        // --- generate source params ---
        profileId: {
          type: 'string',
          description:
            'Image profile ID (required for source=generate). Use list_image_profiles to discover IDs.',
        },
        prompt: {
          type: 'string',
          description:
            'Image generation prompt (required for source=generate). Be descriptive about style, composition, and details.',
        },
        // --- upload source params ---
        base64Data: {
          type: 'string',
          description:
            'Base64-encoded image data (required for source=upload). Supports raw base64 or data: URL format.',
        },
        // --- media source params ---
        mediaUrl: {
          type: 'string',
          description:
            'Existing media reference (required for source=media), e.g. media://element-abc.png',
        },
        // --- target params ---
        elementId: {
          type: 'string',
          description: 'Element ID (required when target=elementImage).',
        },
      },
      required: ['project', 'source'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const source = stringArg(args.source);
    const target = stringArg(args.target, 'none');
    const elementId = optionalStringArg(args.elementId);

    // --- Validate source ---
    if (!['generate', 'upload', 'media'].includes(source)) {
      return {
        content: [{ type: 'text', text: 'Error: source must be "generate", "upload", or "media"' }],
        isError: true,
      };
    }

    // --- Validate target ---
    if (!['projectCover', 'elementImage', 'none'].includes(target)) {
      return {
        content: [
          { type: 'text', text: 'Error: target must be "projectCover", "elementImage", or "none"' },
        ],
        isError: true,
      };
    }

    if (target === 'elementImage' && !elementId) {
      return {
        content: [
          { type: 'text', text: 'Error: elementId is required when target is "elementImage"' },
        ],
        isError: true,
      };
    }

    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    try {
      const storageService = getStorageServiceForContext(ctx);

      const ic: ImageContext = { db, ctx, storageService, username, slug };

      // Step 1: Acquire image buffer
      let acquireResult: AcquireResult;
      if (source === 'generate') {
        acquireResult = await acquireFromGenerate(args, db, target);
      } else if (source === 'upload') {
        acquireResult = acquireFromUpload(args);
      } else {
        acquireResult = await acquireFromMedia(args, storageService, username, slug);
      }
      if ('error' in acquireResult) return acquireResult.error;

      const {
        buffer: imageBuffer,
        mimeType: imageMimeType,
        meta: generationMeta,
      } = acquireResult.image;

      // Step 2: Apply to target
      if (target === 'projectCover') {
        return applyToProjectCover(ic, projectId, imageBuffer, source, generationMeta);
      }

      if (target === 'elementImage') {
        return applyToElementImage(
          ic,
          elementId as string,
          imageBuffer,
          imageMimeType,
          source,
          generationMeta
        );
      }

      // target === 'none'
      if (source === 'upload' || source === 'generate') {
        return saveAndReturnImage(ic, imageBuffer, imageMimeType, source, generationMeta);
      }

      // source === 'media' + target === 'none': just confirm the media exists
      const mediaUrlArg = stringArg(args.mediaUrl);
      return {
        content: [
          {
            type: 'text',
            text: `Media file exists: ${mediaUrlArg} (${Math.round(imageBuffer.length / 1024)}KB)`,
          },
        ],
        structuredContent: {
          success: true,
          source,
          target: 'none',
          mediaUrl: mediaUrlArg,
          sizeBytes: imageBuffer.length,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error in apply_image', err);
      return { content: [{ type: 'text', text: `Error in apply_image: ${err}` }], isError: true };
    }
  },
});
