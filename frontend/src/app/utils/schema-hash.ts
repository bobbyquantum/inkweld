import type { ElementTypeSchema } from '@models/schema-types';

/**
 * Synchronous djb2 string hash rendered as 8 lowercase hex characters.
 * Not cryptographic; used for cheap change detection only.
 */
export function djb2Hex(input: string): string {
  let hash = 5381;
  for (const char of input) {
    hash = (hash << 5) + hash + char.codePointAt(0)!;
    hash = Math.trunc(hash); // keep within 32-bit integer range
  }
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

/**
 * Deterministic JSON serialisation: object keys sorted recursively so that
 * structurally equal values always produce identical strings. Arrays keep
 * their order because order is meaningful for tabs and fields.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort();
  const body = keys
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',');
  return `{${body}}`;
}

/**
 * The parts of a schema that define its shape and defaults. Bookkeeping
 * fields (`version`, `createdAt`, `updatedAt`, `isNew`, `id`) are excluded so
 * that a save which only bumps the version does not register as a change.
 */
export function schemaContent(
  schema: ElementTypeSchema
): Record<string, unknown> {
  return {
    name: schema.name,
    icon: schema.icon,
    description: schema.description,
    tabs: schema.tabs,
    defaultValues: schema.defaultValues,
    defaultAppearance: schema.defaultAppearance,
    defaultImage: schema.defaultImage,
  };
}

/** Content hash of a schema, stable across bookkeeping-only saves. */
export function schemaContentHash(schema: ElementTypeSchema): string {
  return djb2Hex(stableStringify(schemaContent(schema)));
}
