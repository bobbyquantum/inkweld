import { type ElementType } from '../../api-client';

/**
 * Helper to check if an element type is a worldbuilding type.
 * Returns true if the type is ElementType.Worldbuilding (or the string 'WORLDBUILDING').
 */
export function isWorldbuildingType(type: ElementType | string): boolean {
  // Convert to string for comparison to handle both enum and string inputs
  const typeStr = String(type);
  return typeStr === 'WORLDBUILDING';
}

/**
 * Format a worldbuilding fields record into a comma-separated "key: value" string.
 * Skips empty values, internal fields (prefixed with _), and timestamps.
 */
export function formatWorldbuildingFields(
  data: Record<string, unknown>
): string {
  const fieldParts: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      key === 'lastModified' ||
      key.startsWith('_')
    ) {
      continue;
    }

    let formattedValue: string;
    if (Array.isArray(value)) {
      formattedValue = value.filter(Boolean).join(', ');
      if (!formattedValue) continue;
    } else if (typeof value === 'object') {
      continue;
    } else if (typeof value === 'string') {
      formattedValue = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      formattedValue = String(value);
    } else {
      continue;
    }

    fieldParts.push(`${key}: ${formattedValue}`);
  }

  return fieldParts.join(', ');
}
