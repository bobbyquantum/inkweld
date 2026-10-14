/**
 * Field routing for the `update_worldbuilding` MCP tool.
 *
 * A worldbuilding element doc keeps two maps of user data: `identity` (the
 * Identity panel every element has — description and image) and
 * `worldbuilding` (the fields its template defines). A template may define a
 * field whose key is also an identity key (`description` in older templates),
 * so a bare key is resolved against the element's schema first.
 */

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
