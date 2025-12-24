import { ElementType } from '../../api-client';

/**
 * Helper to check if an element type is a worldbuilding type.
 * Returns true if the type is ElementType.Worldbuilding (or the string 'WORLDBUILDING').
 */
export function isWorldbuildingType(type: ElementType | string): boolean {
  // Convert to string for comparison to handle both enum and string inputs
  const typeStr = String(type);
  return typeStr === 'WORLDBUILDING';
}
