import {
  type CanvasImage,
  type CanvasObject,
  type CanvasText,
  isBackgroundImage,
} from '@models/canvas.model';

/** Get Material icon name for a canvas object type */
export function getObjectIcon(obj: CanvasObject): string {
  switch (obj.type) {
    case 'image':
      return isBackgroundImage(obj) ? 'wallpaper' : 'image';
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
      return isBackgroundImage(obj) ? 'Background' : 'Image';
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

/** The CSS font shorthand for a text object, as `document.fonts` wants it. */
export function canvasFontQuery(
  obj: Pick<CanvasText, 'fontFamily' | 'fontSize' | 'fontStyle'>
): string {
  const style = obj.fontStyle.includes('italic') ? 'italic' : 'normal';
  const weight = obj.fontStyle.includes('bold') ? 'bold' : 'normal';
  return `${style} ${weight} ${obj.fontSize}px "${obj.fontFamily}"`;
}

/** Where a picture sits in its box, and which part of it is drawn. */
export interface ImageFitAttrs {
  x: number;
  y: number;
  width: number;
  height: number;
  /** All zero means the whole picture. */
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

/**
 * Konva attributes for how a picture fills its box. `cover` crops the middle
 * of the picture and `contain` letterboxes it, like the same words in CSS. A
 * picture whose size is not known yet just fills the box.
 */
export function imageFitAttrs(
  obj: Pick<CanvasImage, 'fit' | 'width' | 'height'>,
  naturalWidth: number,
  naturalHeight: number
): ImageFitAttrs {
  const fill: ImageFitAttrs = {
    x: 0,
    y: 0,
    width: obj.width,
    height: obj.height,
    cropX: 0,
    cropY: 0,
    cropWidth: 0,
    cropHeight: 0,
  };
  if (!naturalWidth || !naturalHeight) return fill;

  const scaleX = obj.width / naturalWidth;
  const scaleY = obj.height / naturalHeight;
  if (obj.fit === 'cover') {
    const scale = Math.max(scaleX, scaleY);
    const cropWidth = obj.width / scale;
    const cropHeight = obj.height / scale;
    return {
      ...fill,
      cropX: (naturalWidth - cropWidth) / 2,
      cropY: (naturalHeight - cropHeight) / 2,
      cropWidth,
      cropHeight,
    };
  }
  if (obj.fit === 'contain') {
    const scale = Math.min(scaleX, scaleY);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return {
      ...fill,
      x: (obj.width - width) / 2,
      y: (obj.height - height) / 2,
      width,
      height,
    };
  }
  return fill;
}

export {
  type GradientStop,
  isGradientFill,
  linearGradientLine,
  parseCssGradient,
  type ParsedGradient,
  svgEsc,
} from '@inkweld/canvas';
