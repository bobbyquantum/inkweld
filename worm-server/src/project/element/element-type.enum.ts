// element-type.enum.ts
export enum ElementType {
  FOLDER = 'FOLDER',
  ITEM = 'ITEM',
  IMAGE = 'IMAGE' // Added IMAGE type
}

// Optional helper:
export function isExpandable(type: ElementType): boolean {
  return type === ElementType.FOLDER;
}
