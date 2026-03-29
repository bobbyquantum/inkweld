import type {
  CanvasConfig,
  CanvasImage,
  CanvasLayer,
  CanvasObject,
  CanvasPath,
  CanvasPin,
  CanvasShape,
  CanvasText,
} from '@models/canvas.model';

import { svgEsc } from './canvas-utils';

let svgIdCounter = 0;

/** Bounding box result for SVG viewBox computation */
export interface SvgViewBox {
  vX: number;
  vY: number;
  vW: number;
  vH: number;
}

/** Mutable bounding box used during viewBox computation */
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Expand bounding box to include all points of a path object */
function expandBoundsForPath(b: Bounds, obj: CanvasObject): void {
  const pts = (obj as CanvasPath).points;
  for (let i = 0; i < pts.length - 1; i += 2) {
    b.minX = Math.min(b.minX, obj.x + (pts[i] ?? 0));
    b.minY = Math.min(b.minY, obj.y + (pts[i + 1] ?? 0));
    b.maxX = Math.max(b.maxX, obj.x + (pts[i] ?? 0));
    b.maxY = Math.max(b.maxY, obj.y + (pts[i + 1] ?? 0));
  }
}

/** Expand bounding box to include scaled points of a line/arrow shape */
function expandBoundsForLineShape(b: Bounds, obj: CanvasShape): void {
  const pts = obj.points ?? [];
  for (let i = 0; i < pts.length - 1; i += 2) {
    const px = obj.x + (pts[i] ?? 0) * (obj.scaleX || 1);
    const py = obj.y + (pts[i + 1] ?? 0) * (obj.scaleY || 1);
    b.minX = Math.min(b.minX, px);
    b.minY = Math.min(b.minY, py);
    b.maxX = Math.max(b.maxX, px);
    b.maxY = Math.max(b.maxY, py);
  }
}

/** Expand bounding box to include the scaled width/height of an object */
function expandBoundsForBox(b: Bounds, obj: CanvasObject): void {
  const w = ('width' in obj ? obj.width : 30) * (obj.scaleX || 1);
  const h = ('height' in obj ? obj.height : 30) * (obj.scaleY || 1);
  b.minX = Math.min(b.minX, obj.x);
  b.minY = Math.min(b.minY, obj.y);
  b.maxX = Math.max(b.maxX, obj.x + w);
  b.maxY = Math.max(b.maxY, obj.y + h);
}

/** Type guard: true if the object is a line or arrow shape with points */
function isLineOrArrowShape(obj: CanvasObject): obj is CanvasShape {
  return (
    obj.type === 'shape' &&
    (obj.shapeType === 'line' || obj.shapeType === 'arrow') &&
    !!obj.points?.length
  );
}

/** Compute SVG viewBox from visible objects across visible layers */
export function computeSvgViewBox(
  config: CanvasConfig,
  visibleLayers: CanvasLayer[]
): SvgViewBox {
  const b: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  for (const layer of visibleLayers) {
    for (const obj of config.objects.filter(
      o => o.layerId === layer.id && o.visible
    )) {
      if (obj.type === 'path') {
        expandBoundsForPath(b, obj);
      } else if (isLineOrArrowShape(obj)) {
        expandBoundsForLineShape(b, obj);
      } else {
        expandBoundsForBox(b, obj);
      }
    }
  }

  const PAD = 20;
  return {
    vX: (Number.isFinite(b.minX) ? b.minX : 0) - PAD,
    vY: (Number.isFinite(b.minY) ? b.minY : 0) - PAD,
    vW:
      (Number.isFinite(b.maxX) && b.maxX > b.minX ? b.maxX - b.minX : 800) +
      PAD * 2,
    vH:
      (Number.isFinite(b.maxY) && b.maxY > b.minY ? b.maxY - b.minY : 600) +
      PAD * 2,
  };
}

/** Build the SVG transform attribute for an object */
function buildTransformAttr(obj: CanvasObject): string {
  const transforms: string[] = [`translate(${obj.x},${obj.y})`];
  if (obj.rotation) transforms.push(`rotate(${obj.rotation})`);
  if (obj.scaleX !== 1 || obj.scaleY !== 1)
    transforms.push(`scale(${obj.scaleX},${obj.scaleY})`);
  return `transform="${transforms.join(' ')}"`;
}

/** Convert a CanvasObject to an SVG element string */
export function canvasObjectToSvgElement(obj: CanvasObject): string {
  const tf = buildTransformAttr(obj);

  switch (obj.type) {
    case 'shape':
      return canvasShapeToSvg(obj, tf);
    case 'text':
      return canvasTextToSvg(obj, tf);
    case 'path':
      return canvasPathToSvg(obj, tf);
    case 'image':
      return canvasImageToSvg(obj, tf);
    case 'pin':
      return canvasPinToSvg(obj, tf);
    default:
      return '';
  }
}

/** Convert a CanvasShape to its SVG element string */
export function canvasShapeToSvg(obj: CanvasShape, tf: string): string {
  const fill = obj.fill ?? 'none';
  const base = `fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"`;
  const dash = obj.dash?.length
    ? ` stroke-dasharray="${obj.dash.join(',')}"`
    : '';

  switch (obj.shapeType) {
    case 'rect': {
      const cr = obj.cornerRadius ? ` rx="${obj.cornerRadius}"` : '';
      return `<rect ${tf} width="${obj.width}" height="${obj.height}" ${base}${dash}${cr}/>`;
    }
    case 'ellipse': {
      const rx = obj.width / 2;
      const ry = obj.height / 2;
      return `<ellipse ${tf} cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" ${base}${dash}/>`;
    }
    case 'line': {
      const pts: number[] = obj.points ?? [0, 0, obj.width, 0];
      return `<line ${tf} x1="${pts[0]}" y1="${pts[1]}" x2="${pts[2]}" y2="${pts[3]}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"${dash}/>`;
    }
    case 'arrow': {
      const pts: number[] = obj.points ?? [0, 0, obj.width, 0];
      const mid = `arrow-${++svgIdCounter}`;
      const marker = `<defs><marker id="${mid}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="${obj.stroke}"/></marker></defs>`;
      const line = `<line ${tf} x1="${pts[0]}" y1="${pts[1]}" x2="${pts[2]}" y2="${pts[3]}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" marker-end="url(#${mid})"${dash}/>`;
      return marker + line;
    }
    case 'polygon': {
      const pts: number[] = obj.points ?? [];
      const ptStr: string[] = [];
      for (let i = 0; i < pts.length; i += 2)
        ptStr.push(`${pts[i]},${pts[i + 1]}`);
      return `<polygon ${tf} points="${ptStr.join(' ')}" ${base}${dash}/>`;
    }
    default:
      return '';
  }
}

/** Convert a CanvasText to an SVG text element with alignment */
export function canvasTextToSvg(obj: CanvasText, tf: string): string {
  const bold = obj.fontStyle.includes('bold') ? 'bold' : 'normal';
  const italic = obj.fontStyle.includes('italic') ? 'italic' : 'normal';
  const anchorMap: Record<string, string> = {
    center: 'middle',
    right: 'end',
  };
  const anchor = anchorMap[obj.align] ?? 'start';
  const textXMap: Record<string, number> = {
    center: obj.width / 2,
    right: obj.width,
  };
  const textX = textXMap[obj.align] ?? 0;
  const style = `font-size:${obj.fontSize}px;font-family:${obj.fontFamily};font-weight:${bold};font-style:${italic}`;
  return `<text ${tf} x="${textX}" fill="${obj.fill}" style="${style}" text-anchor="${anchor}" dominant-baseline="text-before-edge">${svgEsc(obj.text)}</text>`;
}

/** Convert a CanvasPath to an SVG polyline element */
export function canvasPathToSvg(obj: CanvasPath, tf: string): string {
  const pts = obj.points;
  if (pts.length < 4) return '';
  const d: string[] = [`M ${pts[0]},${pts[1]}`];
  for (let i = 2; i < pts.length; i += 2) d.push(`L ${pts[i]},${pts[i + 1]}`);
  if (obj.closed) d.push('Z');
  const fill = obj.closed && obj.fill ? obj.fill : 'none';
  return `<path ${tf} d="${d.join(' ')}" fill="${fill}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"/>`;
}

/** Convert a CanvasImage to an SVG image or placeholder rect */
export function canvasImageToSvg(obj: CanvasImage, tf: string): string {
  if (obj.src.startsWith('media:')) {
    return `<rect ${tf} width="${obj.width}" height="${obj.height}" fill="#ccc" stroke="#999" stroke-width="1"/>`;
  }
  return `<image ${tf} href="${obj.src}" width="${obj.width}" height="${obj.height}"/>`;
}

/** Convert a CanvasPin to an SVG circle marker with label */
export function canvasPinToSvg(obj: CanvasPin, tf: string): string {
  const label = obj.label
    ? `<text y="24" text-anchor="middle" font-size="12" fill="${obj.color}">${svgEsc(obj.label)}</text>`
    : '';
  return `<g ${tf}><circle r="12" fill="${obj.color}" stroke="#fff" stroke-width="2"/>${label}</g>`;
}

/**
 * Build a complete SVG document string from a canvas config.
 * Returns the SVG markup as a string.
 */
export function buildSvgDocument(config: CanvasConfig): string {
  const visibleLayers = [...config.layers]
    .sort((a, b) => a.order - b.order)
    .filter(l => l.visible);

  const { vX, vY, vW, vH } = computeSvgViewBox(config, visibleLayers);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `  width="${vW}" height="${vH}" viewBox="${vX} ${vY} ${vW} ${vH}">`,
  ];

  for (const layer of visibleLayers) {
    const objs = config.objects.filter(
      o => o.layerId === layer.id && o.visible
    );
    if (!objs.length) continue;
    lines.push(`  <g id="${svgEsc(layer.id)}" opacity="${layer.opacity}">`);
    for (const obj of objs) {
      lines.push('    ' + canvasObjectToSvgElement(obj));
    }
    lines.push('  </g>');
  }

  lines.push('</svg>');
  return lines.join('\n');
}

/**
 * Export the canvas config as an SVG file download.
 * Handles blob creation and browser download trigger.
 */
export function downloadSvg(config: CanvasConfig, elementName: string): void {
  const svgContent = buildSvgDocument(config);
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${elementName}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
