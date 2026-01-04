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
    } = {}
  ): Promise<Buffer> {
    const sharp = await getSharp();

    // In Workers, skip processing and return original buffer
    if (!sharp) {
      logger.warn('ImageService', 'Running in Workers mode - image processing disabled');
      return buffer;
    }

    const { width = 800, height, fit = 'inside', format = 'jpeg', quality = 80 } = options;

    let image = sharp(buffer);

    // Resize
    if (width || height) {
      image = image.resize(width, height, { fit });
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
