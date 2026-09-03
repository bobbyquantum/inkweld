// Lazy-loaded sharp - only works in Node/Bun, not in Workers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharpInstance: any = null;
let sharpLoadAttempted = false;

import { logger } from './logger.service';

async function getSharp() {
  if (sharpLoadAttempted) return sharpInstance;

  sharpLoadAttempted = true;

  // Check if we're in Workers runtime
  const isWorkers =
    typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
  if (isWorkers) {
    return null;
  }

  try {
    const sharpModule = await import('sharp');
    sharpInstance = sharpModule.default;
    return sharpInstance;
  } catch {
    return null;
  }
}

/**
 * Maximum size of a background image upload, before processing. Generous
 * enough for a phone photo, small enough that a hostile admin session cannot
 * park hundreds of megabytes in storage.
 */
export const MAX_BACKGROUND_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Identify an image from its magic bytes.
 *
 * Used instead of trusting the multipart content type, and it is the only
 * check available on Workers where sharp cannot decode the file. Returns null
 * for anything that is not a raster image we are willing to serve — notably
 * SVG, which is a markup format and stays out of the background pipeline.
 */
export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  // GIF: "GIF87a" / "GIF89a"
  if (
    buffer
      .subarray(0, 6)
      .toString('latin1')
      .match(/^GIF8[79]a$/)
  ) {
    return 'image/gif';
  }

  // RIFF container: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // ISO-BMFF container: "....ftypavif" / "....ftypavis"
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') {
      return 'image/avif';
    }
  }

  return null;
}

export class ImageService {
  /**
   * Process and resize an uploaded image
   */
  async processImage(
    buffer: Buffer,
    options: {
      width?: number;
      height?: number;
      fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
      format?: 'jpeg' | 'png' | 'webp';
      quality?: number;
      /** Never scale an image up to reach the target box. */
      withoutEnlargement?: boolean;
    } = {}
  ): Promise<Buffer> {
    const sharp = await getSharp();

    // In Workers, skip processing and return original buffer
    if (!sharp) {
      logger.warn('ImageService', 'Running in Workers mode - image processing disabled');
      return buffer;
    }

    const {
      width = 800,
      height,
      fit = 'inside',
      format = 'jpeg',
      quality = 80,
      withoutEnlargement = false,
    } = options;

    let image = sharp(buffer);

    // Resize
    if (width || height) {
      image = image.resize(width, height, { fit, withoutEnlargement });
    }

    // Convert format
    switch (format) {
      case 'jpeg':
        image = image.jpeg({ quality });
        break;
      case 'png':
        image = image.png({ quality });
        break;
      case 'webp':
        image = image.webp({ quality });
        break;
    }

    return await image.toBuffer();
  }

  /**
   * Process avatar image
   */
  async processAvatar(buffer: Buffer): Promise<Buffer> {
    return await this.processImage(buffer, {
      width: 200,
      height: 200,
      fit: 'cover',
      format: 'png',
      quality: 90,
    });
  }

  /**
   * Process project cover image
   * Uses 1:1.6 portrait aspect ratio (1600x2560 at 300 DPI) to match frontend cropper
   */
  async processCoverImage(buffer: Buffer): Promise<Buffer> {
    return await this.processImage(buffer, {
      width: 1600,
      height: 2560,
      fit: 'inside', // Don't crop - image is already cropped by frontend
      format: 'jpeg',
      quality: 90,
    });
  }

  /**
   * Process a background image for the login/home surfaces.
   *
   * Backgrounds are full-bleed, so they are capped at 2560x1440 (enough for a
   * 2x 1280-wide viewport) and re-encoded to webp, which typically turns a
   * multi-megabyte PNG into a few hundred kilobytes. Every visitor of the
   * login page downloads this file, so the size matters more than usual.
   *
   * When sharp is unavailable (Workers, or a failed native build) the original
   * bytes are stored as-is; the returned content type reflects what was
   * actually produced so callers never mislabel the response.
   */
  async processBackground(buffer: Buffer): Promise<{ data: Buffer; contentType: string }> {
    const sharp = await getSharp();

    if (!sharp) {
      // No transcoding available — keep the upload, but label it honestly.
      return {
        data: buffer,
        contentType: sniffImageType(buffer) ?? 'application/octet-stream',
      };
    }

    const data = await this.processImage(buffer, {
      width: 2560,
      height: 1440,
      fit: 'inside',
      format: 'webp',
      quality: 80,
      // A cap, not a target: upscaling a small source would cost bytes and
      // add nothing but blur.
      withoutEnlargement: true,
    });

    return { data, contentType: 'image/webp' };
  }

  /**
   * Validate an uploaded background image.
   *
   * Stricter than {@link validateImage}: SVG is rejected outright (it can
   * reference external resources and is served from an origin that hosts the
   * app), and the size cap applies even in Workers where we cannot inspect
   * the decoded dimensions.
   */
  async validateBackground(buffer: Buffer): Promise<{ valid: boolean; error?: string }> {
    if (buffer.length > MAX_BACKGROUND_UPLOAD_BYTES) {
      return {
        valid: false,
        error: `Image too large (max ${Math.floor(MAX_BACKGROUND_UPLOAD_BYTES / (1024 * 1024))}MB)`,
      };
    }

    const sniffed = sniffImageType(buffer);
    if (!sniffed) {
      return {
        valid: false,
        error: 'Unsupported image format (use JPEG, PNG, WebP, GIF or AVIF)',
      };
    }

    const sharp = await getSharp();
    if (!sharp) {
      // Magic-byte sniffing is all we have in Workers; it already rules out
      // SVG and non-image payloads.
      return { valid: true };
    }

    try {
      const metadata = await sharp(buffer).metadata();
      if (!['jpeg', 'jpg', 'png', 'gif', 'webp', 'avif'].includes(metadata.format || '')) {
        return { valid: false, error: 'Unsupported image format' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid image file' };
    }
  }

  /**
   * Validate image file
   */
  async validateImage(buffer: Buffer): Promise<{ valid: boolean; error?: string }> {
    const sharp = await getSharp();

    // In Workers, do basic validation only
    if (!sharp) {
      // Check file size (max 10MB)
      if (buffer.length > 10 * 1024 * 1024) {
        return { valid: false, error: 'Image too large (max 10MB)' };
      }
      return { valid: true };
    }

    try {
      const metadata = await sharp(buffer).metadata();

      // Check if format is supported
      if (!['jpeg', 'jpg', 'png', 'gif', 'webp'].includes(metadata.format || '')) {
        return { valid: false, error: 'Unsupported image format' };
      }

      // Check file size (max 10MB)
      if (buffer.length > 10 * 1024 * 1024) {
        return { valid: false, error: 'Image too large (max 10MB)' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid image file' };
    }
  }
}

// Create singleton instance
export const imageService = new ImageService();
