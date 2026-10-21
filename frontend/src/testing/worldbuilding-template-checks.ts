import type { ArchiveWorldbuildingData } from '../app/models/project-archive';
import type { ElementTypeSchema } from '../app/models/schema-types';

/**
 * Keys a template's worldbuilding data may carry that are not schema fields:
 * the identity fields (import copies them to the element's identity map) and
 * the record metadata an export writes.
 */
const IDENTITY_KEYS = new Set(['description', 'image']);
const METADATA_KEYS = new Set([
  'id',
  'name',
  'schemaId',
  'createdDate',
  'lastModified',
]);

/**
 * Problems with a template's worldbuilding data against its schemas, one
 * message per problem (empty when the data is sound):
 *
 * - a key that is no field of the element's schema, so its value is never
 *   shown;
 * - a flat value under the name of a field group (`description` where the
 *   schema has `description.*` fields). The editor cannot hold both and skips
 *   the group, so its tab is empty. Only the identity keys may share a
 *   group's name: import sends them to the identity map, not into the data.
 */
export function worldbuildingDataProblems(
  entries: readonly ArchiveWorldbuildingData[],
  schemas: readonly ElementTypeSchema[]
): string[] {
  const byId = new Map(schemas.map(schema => [schema.id, schema]));
  const problems: string[] = [];
  for (const entry of entries) {
    const schema = byId.get(entry.schemaId);
    if (!schema) {
      problems.push(`${entry.elementId}: no schema ${entry.schemaId}`);
      continue;
    }
    const fields = new Set(
      schema.tabs.flatMap(tab => tab.fields.map(field => field.key))
    );
    const groups = new Set(
      [...fields].filter(key => key.includes('.')).map(key => key.split('.')[0])
    );
    for (const key of Object.keys(entry.data)) {
      if (IDENTITY_KEYS.has(key)) continue;
      if (groups.has(key)) {
        problems.push(
          `${entry.elementId}: flat "${key}" shadows the ${key}.* field group`
        );
      } else if (!fields.has(key) && !METADATA_KEYS.has(key)) {
        problems.push(
          `${entry.elementId}: "${key}" is not a field of ${schema.id}`
        );
      }
    }
  }
  return problems;
}
