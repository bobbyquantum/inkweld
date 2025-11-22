import { ElementType } from '../../api-client';

/**
 * Helper to check if an element type is a worldbuilding type
 */
export function isWorldbuildingType(type: ElementType): boolean {
  // Custom templates start with 'CUSTOM_'
  if (typeof type === 'string' && type.startsWith('CUSTOM_')) {
    return true;
  }

  // Check built-in worldbuilding types
  const worldbuildingTypes: ElementType[] = [
    ElementType.Character,
    ElementType.Location,
    ElementType.WbItem,
    ElementType.Map,
    ElementType.Relationship,
    ElementType.Philosophy,
    ElementType.Culture,
    ElementType.Species,
    ElementType.Systems,
  ];

  return worldbuildingTypes.includes(type);
}
