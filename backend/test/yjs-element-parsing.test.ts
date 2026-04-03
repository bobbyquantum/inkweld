import { describe, it, expect } from 'bun:test';

/**
 * Tests for the element field coercion helpers used in yjs.service.ts.
 *
 * The helpers delegate to a shared `coerceToString` utility that avoids the
 * '[object Object]' pitfall by using JSON.stringify for object values.
 */

function coerceToString(value: NonNullable<unknown>): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as number | boolean | bigint);
}

function coerceNullableString(value: unknown): string | null {
  if (value == null) return null;
  const str = coerceToString(value);
  return str.trim() === '' ? null : str;
}

function coerceOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const str = coerceToString(value);
  return str.trim() === '' ? undefined : str;
}

describe('coerceToString', () => {
  it('returns string values as-is', () => {
    expect(coerceToString('hello')).toBe('hello');
    expect(coerceToString('')).toBe('');
  });

  it('uses JSON.stringify for objects', () => {
    expect(coerceToString({ a: 1 })).toBe('{"a":1}');
    expect(coerceToString([])).toBe('[]');
  });

  it('uses String() for primitives', () => {
    expect(coerceToString(42)).toBe('42');
    expect(coerceToString(true)).toBe('true');
    expect(coerceToString(0)).toBe('0');
  });
});

describe('coerceNullableString (parentId handling)', () => {
  it('returns null for null and undefined', () => {
    expect(coerceNullableString(null)).toBeNull();
    expect(coerceNullableString(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(coerceNullableString('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(coerceNullableString(' ')).toBeNull();
    expect(coerceNullableString('  \t  ')).toBeNull();
    expect(coerceNullableString('\n')).toBeNull();
  });

  it('returns valid string as-is', () => {
    expect(coerceNullableString('abc-123')).toBe('abc-123');
    expect(coerceNullableString('root')).toBe('root');
  });

  it('converts numbers and booleans to string', () => {
    expect(coerceNullableString(42)).toBe('42');
    expect(coerceNullableString(0)).toBe('0');
    expect(coerceNullableString(true)).toBe('true');
  });

  it('serialises objects to JSON instead of [object Object]', () => {
    expect(coerceNullableString({ id: 'x' })).toBe('{"id":"x"}');
    expect(coerceNullableString({})).toBe('{}');
  });
});

describe('coerceOptionalString (schemaId handling)', () => {
  it('returns undefined for null and undefined', () => {
    expect(coerceOptionalString(null)).toBeUndefined();
    expect(coerceOptionalString(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(coerceOptionalString('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(coerceOptionalString(' ')).toBeUndefined();
    expect(coerceOptionalString('  \t  ')).toBeUndefined();
  });

  it('returns valid string schemaId as-is', () => {
    expect(coerceOptionalString('schema-v1')).toBe('schema-v1');
    expect(coerceOptionalString('character')).toBe('character');
  });

  it('converts numbers to string', () => {
    expect(coerceOptionalString(99)).toBe('99');
  });

  it('serialises objects to JSON instead of [object Object]', () => {
    expect(coerceOptionalString({ type: 'chapter' })).toBe('{"type":"chapter"}');
  });
});
