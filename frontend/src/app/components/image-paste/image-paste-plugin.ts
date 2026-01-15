/**
 * Image Paste Plugin for ProseMirror
 *
 * This plugin intercepts image pastes and drops, saves them to the media library,
 * and stores persistent media references (media:mediaId) in the document.
 *
 * This prevents bloating Yjs documents with large base64 strings and ensures
 * images persist across page refreshes.
 *
 * The plugin uses a "media:" URL scheme for persistent storage:
 * - On paste/drop: Save image to media library, insert `media:img-xxx` as src
 * - On render: Use resolveMediaUrl() to get a blob URL for display
 */

import { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callbacks for saving media and getting URLs
 */
export interface ImagePastePluginCallbacks {
  /**
   * Save an image blob to the media library.
   * @param blob - The image blob to save
   * @param mimeType - The MIME type of the image
   * @returns Promise resolving to the media ID (e.g., "img-{uuid}")
   */
  saveImage: (blob: Blob, mimeType: string) => Promise<string>;

  /**
   * Get a blob URL for a stored media item.
   * @param mediaId - The media ID (e.g., "img-{uuid}")
   * @returns Promise resolving to the blob URL, or null if not found
   */
  getImageUrl: (mediaId: string) => Promise<string | null>;

  /**
   * Get the current project key (username/slug format).
   * @returns The project key or null if no project is active
   */
  getProjectKey: () => string | null;
}

/**
 * Plugin key for accessing image paste plugin
 */
export const imagePastePluginKey = new PluginKey('imagePaste');

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a string is a base64 data URL for an image
 */
export function isBase64ImageUrl(src: string): boolean {
  return /^data:image\/[^;]+;base64,/.test(src);
}

/**
 * Extract MIME type from a base64 data URL
 */
export function extractMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/);
  return match?.[1] ?? 'image/png';
}

/**
 * Convert a base64 data URL to a Blob
 */
export function base64ToBlob(dataUrl: string): Blob {
  const mimeType = extractMimeType(dataUrl);
  const base64 = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');

  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  return new Blob([byteArray], { type: mimeType });
}

/**
 * Generate a unique media ID for an image
 */
export function generateMediaId(): string {
  return `img-${crypto.randomUUID()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Media URL Scheme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prefix for media URLs stored in the document.
 * Format: media:{mediaId}
 * Example: media:img-abc123
 */
export const MEDIA_URL_PREFIX = 'media:';

/**
 * Check if a URL is a media reference URL
 */
export function isMediaUrl(url: string): boolean {
  return url?.startsWith(MEDIA_URL_PREFIX) ?? false;
}

/**
 * Extract the media ID from a media URL
 */
export function extractMediaId(mediaUrl: string): string | null {
  if (!isMediaUrl(mediaUrl)) return null;
  return mediaUrl.slice(MEDIA_URL_PREFIX.length);
}

/**
 * Create a media URL from a media ID
 */
export function createMediaUrl(mediaId: string): string {
  return `${MEDIA_URL_PREFIX}${mediaId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paste/Drop Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle paste events, processing images from clipboard
 */
async function handlePaste(
  view: EditorView,
  event: ClipboardEvent,
  callbacks: ImagePastePluginCallbacks
): Promise<boolean> {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return false;

  const projectKey = callbacks.getProjectKey();
  if (!projectKey) return false;

  // Check for image files in clipboard
  const imageFiles = Array.from(clipboardData.files).filter(file =>
    file.type.startsWith('image/')
  );

  if (imageFiles.length > 0) {
    event.preventDefault();

    // Process each image file
    for (const file of imageFiles) {
      try {
        const mediaId = await callbacks.saveImage(file, file.type);

        // Insert image node with a persistent media URL
        // The media:mediaId format survives page refreshes and Yjs sync
        const imageNode = view.state.schema.nodes['image'].create({
          src: createMediaUrl(mediaId),
        });

        const tr = view.state.tr.replaceSelectionWith(imageNode);
        view.dispatch(tr);
      } catch (error) {
        console.error('[ImagePaste] Failed to paste image file:', error);
      }
    }

    return true;
  }

  return false;
}

/**
 * Handle drop events, processing dropped image files
 */
async function handleDrop(
  view: EditorView,
  event: DragEvent,
  callbacks: ImagePastePluginCallbacks
): Promise<boolean> {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return false;

  const projectKey = callbacks.getProjectKey();
  if (!projectKey) return false;

  // Check for image files in drop
  const imageFiles = Array.from(dataTransfer.files).filter(file =>
    file.type.startsWith('image/')
  );

  if (imageFiles.length > 0) {
    event.preventDefault();

    // Get drop position
    const dropPos = view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });

    if (!dropPos) return false;

    // Process each image file
    for (const file of imageFiles) {
      try {
        const mediaId = await callbacks.saveImage(file, file.type);

        // Insert image node with a persistent media URL
        const imageNode = view.state.schema.nodes['image'].create({
          src: createMediaUrl(mediaId),
        });

        const tr = view.state.tr.insert(dropPos.pos, imageNode);
        view.dispatch(tr);
      } catch (error) {
        console.error('[ImagePaste] Failed to drop image file:', error);
      }
    }

    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the image paste plugin
 *
 * @param callbacks - Callbacks for saving and retrieving images
 * @returns A ProseMirror plugin that handles image paste/drop operations
 *
 * @example
 * ```typescript
 * const imagePastePlugin = createImagePastePlugin({
 *   saveImage: async (blob, mimeType) => {
 *     const mediaId = generateMediaId();
 *     await localStorage.saveMedia(projectKey, mediaId, blob);
 *     return mediaId;
 *   },
 *   getImageUrl: async (mediaId) => {
 *     return await localStorage.getMediaUrl(projectKey, mediaId);
 *   },
 *   getProjectKey: () => projectState.project()?.username + '/' + projectState.project()?.slug,
 * });
 * ```
 */
export function createImagePastePlugin(
  callbacks: ImagePastePluginCallbacks
): Plugin {
  return new Plugin({
    key: imagePastePluginKey,

    props: {
      handlePaste(view, event) {
        // Handle async paste in a non-blocking way
        void handlePaste(view, event, callbacks).catch(error => {
          console.error('[ImagePaste] Paste handler error:', error);
        });
        // Return false to allow default handling for non-image pastes
        // The async handler will preventDefault if it handles images
        return false;
      },

      handleDrop(view, event) {
        // Handle async drop in a non-blocking way
        void handleDrop(view, event, callbacks).catch(error => {
          console.error('[ImagePaste] Drop handler error:', error);
        });
        return false;
      },

      /**
       * Transform pasted content - currently a no-op.
       * We only handle direct image file pastes/drops, not HTML with embedded base64.
       */
      transformPasted(slice) {
        return slice;
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Media Image NodeView
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for the media image NodeView
 */
export interface MediaImageNodeViewOptions {
  /**
   * Get a blob URL for a stored media item.
   */
  getImageUrl: (mediaId: string) => Promise<string | null>;
}

/**
 * A simple NodeView that resolves media: URLs to blob URLs for display.
 *
 * This NodeView intercepts rendering of image nodes, checks if the src
 * is a media: URL, and if so, resolves it to a blob URL asynchronously.
 *
 * Note: This is a read-only NodeView that doesn't handle editing or
 * selection. For full editing support with resize handles, ngx-editor's
 * built-in ImageViewComponent should be used.
 */
export class MediaImageNodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private node: ProseMirrorNode;
  private options: MediaImageNodeViewOptions;
  private destroyed = false;

  constructor(
    node: ProseMirrorNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    options: MediaImageNodeViewOptions
  ) {
    this.node = node;
    this.options = options;

    // Create the DOM structure
    this.dom = document.createElement('span');
    this.dom.className = 'media-image-container';

    this.img = document.createElement('img');
    this.img.className = 'media-image';

    // Copy all attributes from the node
    const attrs = node.attrs as Record<string, string | null | undefined>;
    for (const [key, value] of Object.entries(attrs)) {
      if (value != null && key !== 'src') {
        this.img.setAttribute(key, value);
      }
    }

    this.dom.appendChild(this.img);

    // Resolve the image source
    void this.resolveImageSrc(attrs['src']);
  }

  private async resolveImageSrc(src: string | undefined | null): Promise<void> {
    if (this.destroyed) return;

    if (!src) {
      this.img.src = '';
      return;
    }

    // Check if it's a media URL
    if (isMediaUrl(src)) {
      const mediaId = extractMediaId(src);
      if (mediaId) {
        try {
          const blobUrl = await this.options.getImageUrl(mediaId);
          if (!this.destroyed && blobUrl) {
            this.img.src = blobUrl;
          } else if (!this.destroyed) {
            // Show a placeholder or error indicator
            this.img.alt = 'Image not found';
            this.img.style.opacity = '0.5';
          }
        } catch (error) {
          console.error(
            '[MediaImageNodeView] Failed to resolve media URL:',
            error
          );
          if (!this.destroyed) {
            this.img.alt = 'Failed to load image';
            this.img.style.opacity = '0.5';
          }
        }
      }
    } else {
      // Use the src directly (for http:// URLs, data: URLs, etc.)
      this.img.src = src;
    }
  }

  update(node: ProseMirrorNode): boolean {
    // Only update if the node type is the same
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    const attrs = node.attrs as Record<string, string | null | undefined>;

    // Update attributes
    for (const [key, value] of Object.entries(attrs)) {
      if (key !== 'src' && value != null) {
        this.img.setAttribute(key, value);
      }
    }

    // Re-resolve the source if it changed
    void this.resolveImageSrc(attrs['src']);

    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/**
 * Create a nodeViews object for ProseMirror that handles media: URL resolution.
 *
 * @param options - Options including the getImageUrl callback
 * @returns An object with the 'image' key mapped to a NodeView factory
 *
 * @example
 * ```typescript
 * const nodeViews = createMediaImageNodeViews({
 *   getImageUrl: async (mediaId) => {
 *     return await localStorage.getMediaUrl(projectKey, mediaId);
 *   },
 * });
 *
 * const editor = new Editor({
 *   // ... other options
 *   nodeViews,
 * });
 * ```
 */
export function createMediaImageNodeViews(
  options: MediaImageNodeViewOptions
): Record<
  string,
  (
    node: ProseMirrorNode,
    view: EditorView,
    getPos: () => number | undefined
  ) => MediaImageNodeView
> {
  return {
    image: (node, view, getPos) =>
      new MediaImageNodeView(node, view, getPos, options),
  };
}
