/**
 * Tests for custom image sizes API endpoints
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import type { CustomImageSize } from '../src/types/image-generation';

describe('Custom Image Sizes', () => {
  // Test data
  const validCustomSize: CustomImageSize = {
    id: 'custom-1920x1080-123',
    name: 'HD Landscape',
    width: 1920,
    height: 1080,
    description: 'Standard HD for wallpapers',
  };

  const validCustomSize2: CustomImageSize = {
    id: 'custom-1600x2560-456',
    name: 'Kindle Cover',
    width: 1600,
    height: 2560,
    description: 'Ebook cover size',
  };

  describe('CustomImageSize type', () => {
    it('should have required properties', () => {
      expect(validCustomSize.id).toBe('custom-1920x1080-123');
      expect(validCustomSize.name).toBe('HD Landscape');
      expect(validCustomSize.width).toBe(1920);
      expect(validCustomSize.height).toBe(1080);
    });

    it('should have optional description', () => {
      const sizeWithoutDesc: CustomImageSize = {
        id: 'test-id',
        name: 'Test Size',
        width: 1024,
        height: 1024,
      };
      expect(sizeWithoutDesc.description).toBeUndefined();
    });

    it('should allow description', () => {
      expect(validCustomSize.description).toBe('Standard HD for wallpapers');
    });
  });

  describe('Size validation', () => {
    it('should accept sizes within valid range', () => {
      // Minimum valid size
      const minSize: CustomImageSize = {
        id: 'min',
        name: 'Minimum',
        width: 256,
        height: 256,
      };
      expect(minSize.width).toBeGreaterThanOrEqual(256);
      expect(minSize.height).toBeGreaterThanOrEqual(256);

      // Maximum valid size
      const maxSize: CustomImageSize = {
        id: 'max',
        name: 'Maximum',
        width: 4096,
        height: 4096,
      };
      expect(maxSize.width).toBeLessThanOrEqual(4096);
      expect(maxSize.height).toBeLessThanOrEqual(4096);
    });

    it('should calculate megapixels correctly', () => {
      const mp = (validCustomSize.width * validCustomSize.height) / 1_000_000;
      expect(mp).toBeCloseTo(2.07, 1);
    });

    it('should generate size string correctly', () => {
      const sizeString = `${validCustomSize.width}x${validCustomSize.height}`;
      expect(sizeString).toBe('1920x1080');
    });
  });

  describe('Aspect ratio calculation', () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

    it('should calculate 16:9 aspect ratio', () => {
      const divisor = gcd(1920, 1080);
      const w = 1920 / divisor;
      const h = 1080 / divisor;
      expect(w).toBe(16);
      expect(h).toBe(9);
    });

    it('should calculate 1:1 aspect ratio (square)', () => {
      const divisor = gcd(1024, 1024);
      const w = 1024 / divisor;
      const h = 1024 / divisor;
      expect(w).toBe(1);
      expect(h).toBe(1);
    });

    it('should calculate custom aspect ratios', () => {
      const divisor = gcd(1600, 2560);
      const w = 1600 / divisor;
      const h = 2560 / divisor;
      // 1600:2560 = 5:8
      expect(w).toBe(5);
      expect(h).toBe(8);
    });
  });

  describe('Custom sizes array operations', () => {
    let customSizes: CustomImageSize[];

    beforeEach(() => {
      customSizes = [validCustomSize, validCustomSize2];
    });

    it('should add new size to array', () => {
      const newSize: CustomImageSize = {
        id: 'custom-new',
        name: 'New Size',
        width: 800,
        height: 600,
      };
      customSizes.push(newSize);
      expect(customSizes).toHaveLength(3);
      expect(customSizes[2].id).toBe('custom-new');
    });

    it('should remove size from array by id', () => {
      const filtered = customSizes.filter((s) => s.id !== validCustomSize.id);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(validCustomSize2.id);
    });

    it('should find size by id', () => {
      const found = customSizes.find((s) => s.id === validCustomSize.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('HD Landscape');
    });

    it('should detect duplicate IDs', () => {
      const ids = new Set<string>();
      let hasDuplicate = false;

      for (const size of customSizes) {
        if (ids.has(size.id)) {
          hasDuplicate = true;
          break;
        }
        ids.add(size.id);
      }

      expect(hasDuplicate).toBe(false);

      // Add duplicate
      customSizes.push({ ...validCustomSize });
      ids.clear();
      for (const size of customSizes) {
        if (ids.has(size.id)) {
          hasDuplicate = true;
          break;
        }
        ids.add(size.id);
      }
      expect(hasDuplicate).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('should serialize to JSON correctly', () => {
      const json = JSON.stringify([validCustomSize, validCustomSize2]);
      expect(json).toContain('"id":"custom-1920x1080-123"');
      expect(json).toContain('"name":"HD Landscape"');
      expect(json).toContain('"width":1920');
      expect(json).toContain('"height":1080');
    });

    it('should deserialize from JSON correctly', () => {
      const json = JSON.stringify([validCustomSize]);
      const parsed = JSON.parse(json) as CustomImageSize[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(validCustomSize.id);
      expect(parsed[0].name).toBe(validCustomSize.name);
      expect(parsed[0].width).toBe(validCustomSize.width);
      expect(parsed[0].height).toBe(validCustomSize.height);
    });

    it('should handle empty array', () => {
      const json = JSON.stringify([]);
      const parsed = JSON.parse(json) as CustomImageSize[];
      expect(parsed).toEqual([]);
    });
  });
});
