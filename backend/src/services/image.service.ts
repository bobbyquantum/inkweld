import sharp from 'sharp';

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
   */
  async processCoverImage(buffer: Buffer): Promise<Buffer> {
    return await this.processImage(buffer, {
      width: 600,
      height: 400,
      fit: 'cover',
      format: 'jpeg',
      quality: 85,
    });
  }

  /**
   * Validate image file
   */
  async validateImage(buffer: Buffer): Promise<{ valid: boolean; error?: string }> {
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
    } catch (_error) {
      return { valid: false, error: 'Invalid image file' };
    }
  }
}

// Create singleton instance
export const imageService = new ImageService();
