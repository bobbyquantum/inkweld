import { describe, it, expect } from 'bun:test';

/**
 * Tests for the element field parsing logic used in yjs.service.ts getElements().
 * Validates parentId and schemaId handling of null, empty, and whitespace values.
 *
 * The production code:
 *   parentId: elem.parentId != null && String(elem.parentId).trim() !== ''
 *     ? (typeof elem.parentId === 'string' ? elem.parentId : String(elem.parentId))
 *     : null,
 *   schemaId: elem.schemaId != null && String(elem.schemaId).trim() !== ''
 *     ? (typeof elem.schemaId === 'string' ? elem.schemaId : String(elem.schemaId))
 *     : undefined,
 */

function parseParentId(value: unknown): string | null {
  return value != null && String(value).trim() !== ''
    ? typeof value === 'string'
      ? value
      : String(value)
    : null;
}

function parseSchemaId(value: unknown): string | undefined {
  return value != null && String(value).trim() !== ''
    ? typeof value === 'string'
      ? value
      : String(value)
    : undefined;
}

describe('Yjs Element Field Parsing', () => {
  describe('parseParentId', () => {
    it('should return null for null and undefined', () => {
      expect(parseParentId(null)).toBeNull();
      expect(parseParentId(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseParentId('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(parseParentId(' ')).toBeNull();
      expect(parseParentId('  \t  ')).toBeNull();
      expect(parseParentId('\n')).toBeNull();
    });

    it('should return valid string parentId as-is', () => {
      expect(parseParentId('abc-123')).toBe('abc-123');
      expect(parseParentId('root')).toBe('root');
    });

    it('should convert non-string truthy values to string', () => {
      expect(parseParentId(42)).toBe('42');
      expect(parseParentId(true)).toBe('true');
    });

    it('should return null for 0 (stringifies to "0" which is non-empty)', () => {
      // 0 != null is true, and String(0).trim() is "0" which is not empty
      expect(parseParentId(0)).toBe('0');
    });
  });

  describe('parseSchemaId', () => {
    it('should return undefined for null and undefined', () => {
      expect(parseSchemaId(null)).toBeUndefined();
      expect(parseSchemaId(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(parseSchemaId('')).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      expect(parseSchemaId(' ')).toBeUndefined();
      expect(parseSchemaId('  \t  ')).toBeUndefined();
    });

    it('should return valid string schemaId as-is', () => {
      expect(parseSchemaId('schema-v1')).toBe('schema-v1');
      expect(parseSchemaId('character')).toBe('character');
    });

    it('should convert non-string truthy values to string', () => {
      expect(parseSchemaId(99)).toBe('99');
    });
  });
});
