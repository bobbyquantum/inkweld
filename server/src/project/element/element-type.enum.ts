// element-type.enum.ts
export enum ElementType {
  FOLDER = 'FOLDER',
  ITEM = 'ITEM',
  // Worldbuilding types
  CHARACTER = 'CHARACTER',
  LOCATION = 'LOCATION',
  WB_ITEM = 'WB_ITEM', // Worldbuilding Item (to distinguish from document ITEM)
  MAP = 'MAP',
  RELATIONSHIP = 'RELATIONSHIP',
  PHILOSOPHY = 'PHILOSOPHY',
  CULTURE = 'CULTURE',
  SPECIES = 'SPECIES',
  SYSTEMS = 'SYSTEMS',
}

// Optional helper:
export function isExpandable(type: ElementType): boolean {
  return type === ElementType.FOLDER;
}

// Helper to check if an element is a worldbuilding type
export function isWorldbuildingType(type: ElementType): boolean {
  return [
    ElementType.CHARACTER,
    ElementType.LOCATION,
    ElementType.WB_ITEM,
    ElementType.MAP,
    ElementType.RELATIONSHIP,
    ElementType.PHILOSOPHY,
    ElementType.CULTURE,
    ElementType.SPECIES,
    ElementType.SYSTEMS,
  ].includes(type);
}

// Helper to check if an element should be included in EPUB export
export function isExportableToEpub(type: ElementType): boolean {
  return type === ElementType.ITEM;
}
