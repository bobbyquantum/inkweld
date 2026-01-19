/**
 * Reference Image Loader
 *
 * Loads reference images from worldbuilding elements server-side.
 * This avoids the need to send large base64 images from the client.
 */

import type { ReferenceImage, WorldbuildingContext } from '../types/image-generation';
import type { StorageService } from '../services/storage.service';
import { yjsService } from '../services/yjs.service';
import { logger } from '../services/logger.service';
import { getMimeTypeFromFilename } from './prompt-utils';

const refImgLog = logger.child('ReferenceImageLoader');

/**
 * Get the worldbuilding Yjs document ID for an element.
 * Note: The trailing '/' is required because y-websocket appends it.
 */
function getWorldbuildingDocId(username: string, slug: string, elementId: string): string {
  return `${username}:${slug}:${elementId}/`;
}

/**
 * Load a single element's image from storage.
 * Returns null if the element has no image or loading fails.
 */
async function loadElementImage(
  storage: StorageService,
  username: string,
  slug: string,
  elementId: string
): Promise<ReferenceImage | null> {
  try {
    // Get the element's worldbuilding document to read identity
    const wbDocId = getWorldbuildingDocId(username, slug, elementId);
    const sharedDoc = await yjsService.getDocument(wbDocId);
    const identityMap = sharedDoc.doc.getMap('identity');

    // Get the image URL from identity
    const imageUrl = identityMap.get('image') as string | undefined;
    if (!imageUrl) {
      refImgLog.debug(`Element ${elementId} has no image`);
      return null;
    }

    // Handle data: URLs (base64 encoded images pasted directly)
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        refImgLog.warn(`Element ${elementId} has malformed data URL`);
        return null;
      }

      const mimeType = match[1];
      const base64Data = match[2];

      // Truncate for logging
      const truncated = base64Data.length > 100 ? base64Data.substring(0, 100) + '...' : base64Data;
      refImgLog.debug(
        `Loaded inline reference image for ${elementId}: ${mimeType} (${Math.round((base64Data.length * 0.75) / 1024)}KB, data: ${truncated})`
      );

      return {
        data: base64Data,
        mimeType,
        role: 'reference',
        weight: 1.0,
      };
    }

    // Parse media:// URL to get filename
    if (!imageUrl.startsWith('media://')) {
      refImgLog.debug(
        `Element ${elementId} has unsupported image URL scheme: ${imageUrl.substring(0, 50)}...`
      );
      return null;
    }

    const filename = imageUrl.substring('media://'.length);

    // Check if file exists
    const exists = await storage.projectFileExists(username, slug, filename);
    if (!exists) {
      refImgLog.warn(`Element ${elementId} image file not found: ${filename}`);
      return null;
    }

    // Read the file
    const data = await storage.readProjectFile(username, slug, filename);
    if (!data) {
      refImgLog.warn(`Element ${elementId} image file empty: ${filename}`);
      return null;
    }

    // Convert to base64 - handle both Buffer and ArrayBuffer
    const buffer =
      data instanceof Buffer
        ? data
        : data instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(data))
          : Buffer.from(data as unknown as Uint8Array);
    const base64 = buffer.toString('base64');
    const mimeType = getMimeTypeFromFilename(filename);

    refImgLog.debug(
      `Loaded reference image for ${elementId}: ${filename} (${Math.round(buffer.length / 1024)}KB)`
    );

    return {
      data: base64,
      mimeType,
      role: 'reference',
      weight: 1.0,
    };
  } catch (err) {
    refImgLog.error(`Failed to load image for element ${elementId}:`, err);
    return null;
  }
}

/**
 * Load reference images from worldbuilding context.
 * Looks for elements with role 'reference' and loads their images from storage.
 *
 * @param storage - The storage service to use
 * @param username - Project owner username
 * @param slug - Project slug
 * @param worldbuildingContext - Array of worldbuilding context elements
 * @returns Array of loaded reference images
 */
export async function loadReferenceImagesFromContext(
  storage: StorageService,
  username: string,
  slug: string,
  worldbuildingContext: WorldbuildingContext[]
): Promise<ReferenceImage[]> {
  // Filter for elements with role 'reference'
  const referenceElements = worldbuildingContext.filter((ctx) => ctx.role === 'reference');

  if (referenceElements.length === 0) {
    refImgLog.debug('No reference elements in worldbuilding context');
    return [];
  }

  refImgLog.info(`Loading ${referenceElements.length} reference image(s) for ${username}/${slug}`);

  // Load images in parallel
  const imagePromises = referenceElements.map((ctx) =>
    loadElementImage(storage, username, slug, ctx.elementId)
  );

  const results = await Promise.all(imagePromises);

  // Filter out nulls (elements without images or load failures)
  const images = results.filter((img): img is ReferenceImage => img !== null);

  refImgLog.info(
    `Successfully loaded ${images.length}/${referenceElements.length} reference images`
  );

  return images;
}

/**
 * Get image URLs from worldbuilding context elements (without loading full image data).
 * Used for audit logging.
 *
 * @param username - Project owner username
 * @param slug - Project slug
 * @param worldbuildingContext - Array of worldbuilding context elements
 * @returns Array of image URLs (media:// or data: URLs)
 */
export async function getElementImageUrls(
  username: string,
  slug: string,
  worldbuildingContext: WorldbuildingContext[]
): Promise<string[]> {
  // Filter for elements with role 'reference'
  const referenceElements = worldbuildingContext.filter((ctx) => ctx.role === 'reference');

  if (referenceElements.length === 0) {
    return [];
  }

  const urls: string[] = [];

  for (const ctx of referenceElements) {
    try {
      const wbDocId = getWorldbuildingDocId(username, slug, ctx.elementId);
      const sharedDoc = await yjsService.getDocument(wbDocId);
      const identityMap = sharedDoc.doc.getMap('identity');
      const imageUrl = identityMap.get('image') as string | undefined;

      if (imageUrl) {
        // For data URLs, just store the MIME type and truncated marker for brevity
        if (imageUrl.startsWith('data:')) {
          const mimeMatch = imageUrl.match(/^data:([^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/*';
          urls.push(`data:${mimeType};base64,[inline-image]`);
        } else {
          urls.push(imageUrl);
        }
      }
    } catch {
      refImgLog.debug(`Could not get image URL for element ${ctx.elementId}`);
    }
  }

  return urls;
}
