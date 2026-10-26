/**
 * Field routing for the `update_worldbuilding` MCP tool.
 *
 * A worldbuilding element doc keeps two maps of user data: `identity` (the
 * Identity panel every element has — description and image) and
 * `worldbuilding` (the fields its template defines). A template may define a
 * field whose key is also an identity key (`description` in older templates),
 * so a bare key is resolved against the element's schema first.
 */
import { flattenToPaths } from '../../utils/yjs-map-path';

/** Identity keys a bare field name can address when the schema doesn't claim it. */
export const IDENTITY_FIELD_KEYS: ReadonlySet<string> = new Set(['description', 'image']);

const IDENTITY_PREFIX = 'identity.';
const WORLDBUILDING_PREFIX = 'worldbuilding.';

export interface RoutedWorldbuildingFields {
  identity: Record<string, unknown>;
  worldbuilding: Record<string, unknown>;
}

/** Collect every field key defined in a schema's tabs. */
export function schemaFieldKeys(schema: unknown): Set<string> {
  const keys = new Set<string>();
  const tabs = (schema as { tabs?: unknown } | null)?.tabs;
  if (!Array.isArray(tabs)) return keys;
  for (const tab of tabs) {
    const fields = (tab as { fields?: unknown } | null)?.fields;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      const key = (field as { key?: unknown } | null)?.key;
      if (typeof key === 'string') keys.add(key);
    }
  }
  return keys;
}

/**
 * Split `update_worldbuilding` input between the identity and worldbuilding maps.
 *
 * - `identity.<key>` always writes the identity map.
 * - `worldbuilding.<key>` always writes the template field.
 * - A bare key writes the template field when the element's schema defines
 *   it, otherwise the identity map for `description`/`image`, otherwise the
 *   worldbuilding map.
 */
export function routeWorldbuildingFields(
  fields: Record<string, unknown>,
  schemaKeys: ReadonlySet<string>
): RoutedWorldbuildingFields {
  const routed: RoutedWorldbuildingFields = { identity: {}, worldbuilding: {} };
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith(IDENTITY_PREFIX)) {
      routed.identity[key.slice(IDENTITY_PREFIX.length)] = value;
    } else if (key.startsWith(WORLDBUILDING_PREFIX)) {
      routed.worldbuilding[key.slice(WORLDBUILDING_PREFIX.length)] = value;
    } else if (!schemaKeys.has(key) && IDENTITY_FIELD_KEYS.has(key)) {
      routed.identity[key] = value;
    } else {
      routed.worldbuilding[key] = value;
    }
  }
  return routed;
}

export interface WorldbuildingDefaults {
  /** Template field defaults; dotted keys are nested fields. */
  worldbuilding: Record<string, unknown>;
  /** Identity defaults (`appearance` flattened to dotted keys, `image`). */
  identity: Record<string, unknown>;
}

/**
 * The empty field skeleton a new element of this schema starts with,
 * mirroring the frontend's `initializeWorldbuildingElement`: schema default
 * values, an empty value for every template field (a nested map for dotted
 * keys, `[]` for arrays), and the schema's default appearance and image.
 * Relationship fields live in the relationships store and are skipped.
 */
export function worldbuildingDefaults(schema: unknown): WorldbuildingDefaults {
  const s = (schema ?? {}) as {
    defaultValues?: unknown;
    defaultAppearance?: unknown;
    defaultImage?: unknown;
  };
  const worldbuilding: Record<string, unknown> = {};
  const identity: Record<string, unknown> = {};
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  if (isRecord(s.defaultValues)) Object.assign(worldbuilding, s.defaultValues);

  // A key can't hold both a value and dotted child fields; whichever is
  // defined first wins so the skeleton can always be written.
  const nestedParents = new Set<string>();
  const tabs = (schema as { tabs?: unknown } | null)?.tabs;
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    const fields = (tab as { fields?: unknown } | null)?.fields;
    for (const field of Array.isArray(fields) ? fields : []) {
      const { key, type } = (field ?? {}) as { key?: unknown; type?: unknown };
      if (typeof key !== 'string' || !key || type === 'relationship') continue;
      const empty = type === 'array' ? [] : '';
      const dot = key.indexOf('.');
      if (dot > 0) {
        const parent = key.slice(0, dot);
        const existing = worldbuilding[parent];
        if (existing !== undefined && existing !== null && !isRecord(existing)) continue;
        nestedParents.add(parent);
        if (type === 'array' || !(key in worldbuilding)) worldbuilding[key] = empty;
      } else if (!nestedParents.has(key) && (worldbuilding[key] ?? null) === null) {
        worldbuilding[key] = empty;
      }
    }
  }

  if (isRecord(s.defaultAppearance)) {
    for (const { path, value } of flattenToPaths(s.defaultAppearance, 'appearance')) {
      identity[path] = value;
    }
  }
  if (typeof s.defaultImage === 'string' && s.defaultImage) identity.image = s.defaultImage;

  return { worldbuilding, identity };
}
