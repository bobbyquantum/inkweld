/** Longest side, in pixels, published images are scaled down to. */
export const PUBLISH_IMAGE_MAX_SIDE = 1600;

/** JPEG quality used when re-encoding images for publishing. */
const PUBLISH_IMAGE_JPEG_QUALITY = 0.86;

/** A re-encoded image and its pixel size. */
export interface ShrunkImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Re-encode an image as a JPEG no larger than {@link PUBLISH_IMAGE_MAX_SIDE}
 * on its longest side. Generated art is often a multi-megabyte PNG; embedded
 * as-is, a dozen of them make a PDF or single-page HTML file of tens of
 * megabytes. Transparent areas become white, like the page.
 *
 * Returns null when the browser cannot decode or re-encode the image (SVG,
 * no OffscreenCanvas), so the caller can fall back to the original.
 */
export async function shrinkImageToJpeg(
  blob: Blob
): Promise<ShrunkImage | null> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas === 'undefined' ||
    blob.type === 'image/svg+xml'
  ) {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(
      1,
      PUBLISH_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const jpeg = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: PUBLISH_IMAGE_JPEG_QUALITY,
    });
    return { blob: jpeg, width, height };
  } catch {
    return null;
  }
}
