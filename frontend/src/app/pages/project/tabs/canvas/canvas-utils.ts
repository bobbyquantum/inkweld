import type { CanvasObject } from '@models/canvas.model';

/** Get Material icon name for a canvas object type */
export function getObjectIcon(obj: CanvasObject): string {
  switch (obj.type) {
    case 'image':
      return 'image';
    case 'text':
      return 'title';
    case 'path':
      return 'draw';
    case 'shape':
      return 'crop_square';
    case 'pin':
      return 'place';
    default:
      return 'category';
  }
}

/** Get a display label for an unnamed canvas object */
export function getObjectLabel(obj: CanvasObject): string {
  switch (obj.type) {
    case 'image':
      return 'Image';
    case 'text':
      return obj.text.substring(0, 30) || 'Text';
    case 'path':
      return `Path (${Math.floor(obj.points.length / 2)} pts)`;
    case 'shape':
      return obj.shapeType;
    case 'pin':
      return obj.label.trim() || 'Pin';
    default:
      return 'Object';
  }
}

/** Check if two axis-aligned bounding boxes overlap */
export function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Escape special XML/HTML characters for SVG output */
export function svgEsc(s: string): string {
  return s.replaceAll(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] ?? c
  );
}
