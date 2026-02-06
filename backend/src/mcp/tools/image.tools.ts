/**
 * MCP Tools: Image Generation and Management
 *
 * Tools for generating images via AI and assigning them to worldbuilding elements.
 *
 * NOTE: Image tools currently require Bun runtime (use LevelDB-based yjsService).
 * On Cloudflare Workers, image assignment operations are not yet supported.
 */

import { registerTool } from '../mcp.handler';
import type { McpContext, McpToolResult, ActiveProjectContext } from '../mcp.types';
import { getProjectByKey, hasProjectPermission } from '../mcp.types';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { imageGenerationService } from '../../services/image-generation.service';
import { imageProfileService } from '../../services/image-profile.service';
import { imageService } from '../../services/image.service';
import { projectService } from '../../services/project.service';
import { getStorageService } from '../../services/storage.service';
import { yjsService } from '../../services/yjs.service';
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

/**
 * Get the worldbuilding Yjs document ID for an element
 */
function getWorldbuildingDocId(username: string, slug: string, elementId: string): string {
  return `${username}:${slug}:${elementId}/`;
}

// ============================================
// generate_image tool
// ============================================

registerTool({
  tool: {
    name: 'generate_image',
    title: 'Generate Image',
    description:
      'Generate an image using AI. Returns base64 image data that can be used with set_element_image.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'The image generation prompt. Be descriptive about style, composition, and details.',
        },
        provider: {
          type: 'string',
          enum: ['openai', 'openrouter', 'stable-diffusion', 'falai'],
          description: 'AI provider to use (defaults to the configured default)',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '832x1248', '1248x832', '864x1184', '1184x864'],
          description: 'Image size. Default is 1024x1024 (square). Use 832x1248 for portrait.',
        },
        style: {
          type: 'string',
          enum: ['vivid', 'natural'],
          description:
            'Image style (provider-specific). Vivid is more dramatic, natural is more realistic.',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'auto'],
          description: 'Image quality. Higher quality takes longer but produces more detail.',
        },
      },
      required: ['prompt'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const prompt = String(args.prompt ?? '').trim();
    const provider = args.provider as ImageProviderType | undefined;
    const size = args.size as string | undefined;
    const style = args.style as 'vivid' | 'natural' | undefined;
    const quality = args.quality as 'standard' | 'hd' | undefined;

    if (!prompt) {
      return {
        content: [{ type: 'text', text: 'Error: prompt is required' }],
        isError: true,
      };
    }

    try {
      // Check if image generation is available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isAvailable = await imageGenerationService.isAvailable(db as any);
      if (!isAvailable) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No image generation provider is available. Please configure an AI image provider.',
            },
          ],
          isError: true,
        };
      }

      // Get first enabled profile for generation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = await imageProfileService.getFirstEnabled(db as any);
      if (!profile) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No enabled image profile found. Please configure an image profile.',
            },
          ],
          isError: true,
        };
      }

      // Build resolved request from profile
      const request: ResolvedImageRequest = {
        prompt,
        profileId: profile.id,
        provider: (provider || profile.provider) as ImageProviderType,
        model: profile.modelId,
        size: (size || profile.defaultSize || '1024x1024') as ImageSize,
        style,
        quality,
        n: 1,
        options: profile.modelConfig || undefined,
      };

      // Generate the image
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await imageGenerationService.generate(db as any, request);

      if (!result.data || result.data.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No images were generated' }],
          isError: true,
        };
      }

      const image = result.data[0];
      const imageData = image.b64Json || image.url;

      if (!imageData) {
        return {
          content: [{ type: 'text', text: 'Error: No image data returned' }],
          isError: true,
        };
      }

      // Return image data - can include base64 image in MCP response
      return {
        content: [
          {
            type: 'text',
            text: `Generated image with prompt: "${prompt.substring(0, 50)}..."`,
          },
          // If it's base64, we can include it as an image content type
          ...(image.b64Json
            ? [
                {
                  type: 'image' as const,
                  data: image.b64Json,
                  mimeType: 'image/png',
                },
              ]
            : []),
        ],
        structuredContent: {
          success: true,
          imageData: imageData,
          isBase64: !!image.b64Json,
          isUrl: !!image.url,
          revisedPrompt: image.revisedPrompt,
          provider: result.provider,
          model: result.model,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error generating image', err);
      return {
        content: [{ type: 'text', text: `Error generating image: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// set_element_image tool
// ============================================

registerTool({
  tool: {
    name: 'set_element_image',
    title: 'Set Element Image',
    description:
      'Set the image for a worldbuilding element. Accepts base64 image data (with or without data: prefix). The image is saved to project storage and referenced by URL.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'ID of the element to set the image for',
        },
        imageData: {
          type: 'string',
          description: 'Base64-encoded image data (with or without data: prefix)',
        },
      },
      required: ['project', 'elementId', 'imageData'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId ?? '');
    const imageData = String(args.imageData ?? '');

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    if (!imageData) {
      return {
        content: [{ type: 'text', text: 'Error: imageData is required' }],
        isError: true,
      };
    }

    try {
      // Extract raw base64 data
      let base64Data = imageData;
      let mimeType = 'image/png';

      if (imageData.startsWith('data:')) {
        // Parse data URL: data:image/png;base64,xxxxx
        const matches = imageData.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          const commaIndex = imageData.indexOf(',');
          if (commaIndex > 0) {
            base64Data = imageData.substring(commaIndex + 1);
          }
        }
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');

      // Generate a unique filename for the element's image
      const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const filename = `element-${elementId}.${extension}`;

      // Save to storage
      const storageService = getStorageService();
      await storageService.saveProjectFile(username, slug, filename, buffer, mimeType);

      // Store the media URL reference in Yjs (NOT the base64 data)
      const mediaUrl = `media://${filename}`;
      const wbDocId = getWorldbuildingDocId(username, slug, elementId);
      const sharedDoc = await yjsService.getDocument(wbDocId);
      const identityMap = sharedDoc.doc.getMap('identity');

      sharedDoc.doc.transact(() => {
        identityMap.set('image', mediaUrl);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Set image for element "${elementId}": ${filename} (${Math.round(buffer.length / 1024)}KB)`,
          },
        ],
        structuredContent: {
          success: true,
          elementId,
          filename,
          mediaUrl,
          sizeBytes: buffer.length,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error setting element image', err);
      return {
        content: [{ type: 'text', text: `Error setting element image: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// generate_and_set_element_image tool (convenience)
// ============================================

registerTool({
  tool: {
    name: 'generate_and_set_element_image',
    title: 'Generate and Set Element Image',
    description:
      'Generate an AI image and immediately assign it to a worldbuilding element. Combines generate_image and set_element_image in one step.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'ID of the element to set the image for',
        },
        prompt: {
          type: 'string',
          description:
            'The image generation prompt. Be descriptive about style, composition, and details.',
        },
        provider: {
          type: 'string',
          enum: ['openai', 'openrouter', 'stable-diffusion', 'falai'],
          description: 'AI provider to use (defaults to the configured default)',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '832x1248', '1248x832', '864x1184', '1184x864'],
          description: 'Image size. Default is 1024x1024 (square). Use 832x1248 for portrait.',
        },
      },
      required: ['project', 'elementId', 'prompt'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId ?? '');
    const prompt = String(args.prompt ?? '').trim();
    const provider = args.provider as ImageProviderType | undefined;
    const size = args.size as string | undefined;

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    if (!prompt) {
      return {
        content: [{ type: 'text', text: 'Error: prompt is required' }],
        isError: true,
      };
    }

    try {
      // Step 1: Generate the image
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isAvailable = await imageGenerationService.isAvailable(db as any);
      if (!isAvailable) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No image generation provider is available. Please configure an AI image provider.',
            },
          ],
          isError: true,
        };
      }

      // Get first enabled profile for generation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = await imageProfileService.getFirstEnabled(db as any);
      if (!profile) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No enabled image profile found. Please configure an image profile.',
            },
          ],
          isError: true,
        };
      }

      // Build resolved request from profile
      const request: ResolvedImageRequest = {
        prompt,
        profileId: profile.id,
        provider: (provider || profile.provider) as ImageProviderType,
        model: profile.modelId,
        size: (size || profile.defaultSize || '1024x1024') as ImageSize,
        n: 1,
        options: profile.modelConfig || undefined,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await imageGenerationService.generate(db as any, request);

      if (!result.data || result.data.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No images were generated' }],
          isError: true,
        };
      }

      const image = result.data[0];

      if (!image.b64Json) {
        return {
          content: [{ type: 'text', text: 'Error: No base64 image data returned' }],
          isError: true,
        };
      }

      // Step 2: Save image to file storage (not base64 in Yjs!)
      const buffer = Buffer.from(image.b64Json, 'base64');
      const filename = `element-${elementId}.png`;

      const storageService = getStorageService();
      await storageService.saveProjectFile(username, slug, filename, buffer, 'image/png');

      // Step 3: Store media URL reference in Yjs (NOT the base64 data)
      const mediaUrl = `media://${filename}`;
      const wbDocId = getWorldbuildingDocId(username, slug, elementId);
      const sharedDoc = await yjsService.getDocument(wbDocId);
      const identityMap = sharedDoc.doc.getMap('identity');

      sharedDoc.doc.transact(() => {
        identityMap.set('image', mediaUrl);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Generated and set image for element "${elementId}": ${filename} (${Math.round(buffer.length / 1024)}KB)`,
          },
        ],
        structuredContent: {
          success: true,
          elementId,
          filename,
          mediaUrl,
          sizeBytes: buffer.length,
          revisedPrompt: image.revisedPrompt,
          provider: result.provider,
          model: result.model,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error generating and setting element image', err);
      return {
        content: [{ type: 'text', text: `Error generating and setting element image: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// set_project_cover tool
// ============================================

registerTool({
  tool: {
    name: 'set_project_cover',
    title: 'Set Project Cover',
    description:
      'Set the cover image for the project. Accepts base64 image data (with or without data: prefix). The cover will appear on the project card in the home screen.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        imageData: {
          type: 'string',
          description: 'Base64-encoded image data (with or without data: prefix)',
        },
      },
      required: ['project', 'imageData'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    const imageData = String(args.imageData ?? '');

    if (!imageData) {
      return {
        content: [{ type: 'text', text: 'Error: imageData is required' }],
        isError: true,
      };
    }

    try {
      // Extract raw base64 data
      let base64Data = imageData;
      if (imageData.startsWith('data:')) {
        // Extract base64 from data URL: data:image/png;base64,xxxxx
        const commaIndex = imageData.indexOf(',');
        if (commaIndex > 0) {
          base64Data = imageData.substring(commaIndex + 1);
        }
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');

      // Validate the image
      const validation = await imageService.validateImage(buffer);
      if (!validation.valid) {
        return {
          content: [{ type: 'text', text: `Error: Invalid image - ${validation.error}` }],
          isError: true,
        };
      }

      // Process as cover image (resize/crop to standard size)
      const processedImage = await imageService.processCoverImage(buffer);

      // Save to storage (uses filesystem fallback for MCP)
      const storageService = getStorageService();
      await storageService.saveProjectFile(
        username,
        slug,
        'cover.jpg',
        processedImage,
        'image/jpeg'
      );

      // Update the project's coverImage field in database
      await projectService.update(db as DatabaseInstance, projectId, { coverImage: 'cover.jpg' });

      return {
        content: [
          {
            type: 'text',
            text: `Set project cover image (${Math.round(processedImage.length / 1024)}KB)`,
          },
        ],
        structuredContent: {
          success: true,
          filename: 'cover.jpg',
          sizeBytes: processedImage.length,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error setting project cover', err);
      return {
        content: [{ type: 'text', text: `Error setting project cover: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// generate_project_cover tool (convenience)
// ============================================

registerTool({
  tool: {
    name: 'generate_project_cover',
    title: 'Generate Project Cover',
    description:
      'Generate an AI image and set it as the project cover. The cover will appear on the project card in the home screen.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        prompt: {
          type: 'string',
          description:
            'The image generation prompt for the cover. Be descriptive about style, composition, and details. Consider a landscape orientation for covers.',
        },
        provider: {
          type: 'string',
          enum: ['openai', 'openrouter', 'stable-diffusion', 'falai'],
          description: 'AI provider to use (defaults to the configured default)',
        },
      },
      required: ['project', 'prompt'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    const prompt = String(args.prompt ?? '').trim();
    const provider = args.provider as ImageProviderType | undefined;

    if (!prompt) {
      return {
        content: [{ type: 'text', text: 'Error: prompt is required' }],
        isError: true,
      };
    }

    try {
      // Check if image generation is available
      const isAvailable = await imageGenerationService.isAvailable(db as DatabaseInstance);
      if (!isAvailable) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No image generation provider is available. Please configure an AI image provider.',
            },
          ],
          isError: true,
        };
      }

      // Get first enabled profile for generation
      const profile = await imageProfileService.getFirstEnabled(db as DatabaseInstance);
      if (!profile) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No enabled image profile found. Please configure an image profile.',
            },
          ],
          isError: true,
        };
      }

      // Build resolved request from profile - use landscape size for covers
      const request: ResolvedImageRequest = {
        prompt,
        profileId: profile.id,
        provider: (provider || profile.provider) as ImageProviderType,
        model: profile.modelId,
        size: '1248x832', // Landscape for covers
        n: 1,
        options: profile.modelConfig || undefined,
      };

      // Generate with landscape size for covers
      const result = await imageGenerationService.generate(db as DatabaseInstance, request);

      if (!result.data || result.data.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No images were generated' }],
          isError: true,
        };
      }

      const image = result.data[0];

      if (!image.b64Json) {
        return {
          content: [{ type: 'text', text: 'Error: No image data returned (base64 expected)' }],
          isError: true,
        };
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(image.b64Json, 'base64');

      // Process as cover image (resize/crop to standard size)
      const processedImage = await imageService.processCoverImage(buffer);

      // Save to storage (uses filesystem fallback for MCP)
      const storageService = getStorageService();
      await storageService.saveProjectFile(
        username,
        slug,
        'cover.jpg',
        processedImage,
        'image/jpeg'
      );

      // Update the project's coverImage field in database
      await projectService.update(db as DatabaseInstance, projectId, { coverImage: 'cover.jpg' });

      return {
        content: [
          {
            type: 'text',
            text: `Generated and set project cover image (${Math.round(processedImage.length / 1024)}KB)`,
          },
        ],
        structuredContent: {
          success: true,
          filename: 'cover.jpg',
          sizeBytes: processedImage.length,
          revisedPrompt: image.revisedPrompt,
          provider: result.provider,
          model: result.model,
        },
      };
    } catch (err) {
      mcpImageLog.error('Error generating project cover', err);
      return {
        content: [{ type: 'text', text: `Error generating project cover: ${err}` }],
        isError: true,
      };
    }
  },
});
