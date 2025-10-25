import type { ElementTypeSchema } from '../worldbuilding-schema.interface.js';
import characterSchema from './character.json' with { type: 'json' };
import locationSchema from './location.json' with { type: 'json' };

/**
 * All default schemas that ship with the application
 * These are copied into new projects
 */
export const DEFAULT_SCHEMAS: Record<string, ElementTypeSchema> = {
  CHARACTER: characterSchema as ElementTypeSchema,
  LOCATION: locationSchema as ElementTypeSchema,
  // TODO: Add more schemas as they're created
  // WB_ITEM: itemSchema,
  // MAP: mapSchema,
  // RELATIONSHIP: relationshipSchema,
  // PHILOSOPHY: philosophySchema,
  // CULTURE: cultureSchema,
  // SPECIES: speciesSchema,
  // SYSTEMS: systemsSchema,
};

/**
 * Get default schema for a specific element type
 */
export function getDefaultSchema(type: string): ElementTypeSchema | undefined {
  return DEFAULT_SCHEMAS[type];
}

/**
 * Get all default schemas as an array
 */
export function getAllDefaultSchemas(): ElementTypeSchema[] {
  return Object.values(DEFAULT_SCHEMAS);
}
