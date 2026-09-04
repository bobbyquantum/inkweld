/**
 * Content hashing for worldbuilding element schemas.
 *
 * This MUST stay byte-for-byte equivalent to
 * `frontend/src/app/utils/schema-hash.ts`: the frontend compares the hash the
 * backend stores on an element's schema copy (`schema.baseHash`) against its
 * own hash of the shared schema to decide whether the element is "custom" or
 * has a shared update available. Keep the two files in step.
 */

/** Minimal shape of an element type schema, as stored in the project doc. */
export interface SchemaLike {
  id: string;
  name: string;
  icon: string;
  description: string;
  version: number;
  tabs: unknown[];
  defaultValues?: unknown;
  defaultAppearance?: unknown;
  defaultImage?: unknown;
  [key: string]: unknown;
}

/** Synchronous djb2 string hash rendered as 8 lowercase hex characters. */
export function djb2Hex(input: string): string {
  let hash = 5381;
  for (const char of input) {
    hash = (hash << 5) + hash + (char.codePointAt(0) ?? 0);
    hash = Math.trunc(hash);
  }
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

/**
 * Deterministic JSON serialisation with recursively sorted object keys.
 * Arrays keep their order (tab and field order is meaningful).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',');
  return `{${body}}`;
}

/**
 * The parts of a schema that define its shape and defaults. Bookkeeping
 * fields (`id`, `version`, `createdAt`, `updatedAt`, `isNew`) are excluded.
 */
export function schemaContent(schema: SchemaLike): Record<string, unknown> {
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
export function schemaContentHash(schema: SchemaLike): string {
  return djb2Hex(stableStringify(schemaContent(schema)));
}
