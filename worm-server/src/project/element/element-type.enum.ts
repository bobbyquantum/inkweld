// element-type.enum.ts
export enum ElementType {
  FOLDER = 'FOLDER',
  ITEM = 'ITEM',
}

// Optional helper:
export function isExpandable(type: ElementType): boolean {
  return type === ElementType.FOLDER;
}
