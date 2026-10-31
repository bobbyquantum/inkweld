/**
 * Draws canvas contents as an SVG document. The app's SVG export uses it, and
 * the server rasterises its output for `render_canvas`, so what it draws has
 * to match what the canvas draws. Pure: what differs between the two is passed
 * in as {@link SvgOptions}.
 */

import {
  isGradientFill,
  linearGradientLine,
  parseCssGradient,
  svgEsc,
} from './gradient';
import { buildInkOutline, buildPathData } from './ink-stroke';
import {
  type CanvasConfig,
  type CanvasImage,
  type CanvasLayer,
  type CanvasObject,
  type CanvasPath,
  type CanvasPin,
  type CanvasShape,
  type CanvasText,
  isBackgroundImage,
} from './model';
import {
  estimateTextSize,
  layoutCanvasText,
  type TextMeasurer,
} from './text-layout';

let svgIdCounter = 0;

/** What differs between the places an SVG is drawn. */
export interface SvgOptions {
  /** Measures text, so it wraps as it does on the canvas. Default: estimated. */
  measureText?: TextMeasurer;
  /** The family to name for a font, when the reader has another one. */
  mapFontFamily?: (family: string) => string;
  /**
   * What an image shows, or null for a placeholder. By default an image from
   * project media is a placeholder, since an exported file cannot reach it.
   */
  resolveImage?: (src: string) => string | null;
  /** Whether a pin shows its label. The canvas itself does not. Default true. */
  pinLabels?: boolean;
}

/** What a document is drawn from. */
export type SvgSource = Pick<CanvasConfig, 'layers' | 'objects'> & {
  background?: string;
};

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

/** A rectangular area in canvas coordinates. */
export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The space a pin's marker takes up either side of its position. Its label
 * sits below, so an export needs room for that too.
 */
const PIN_REACH = 15;

/**
 * The box around an area once its object has turned, which it does around its
 * own x and y. It touches the corners of a turned rectangle, so anything past
 * the box really is past it; for a path it can be a little generous.
 */
function rotatedBounds(obj: CanvasObject, rect: CanvasRect): CanvasRect {
  const angle = (obj.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [rect.x - obj.x, rect.x + rect.width - obj.x]) {
    for (const y of [rect.y - obj.y, rect.y + rect.height - obj.y]) {
      xs.push(obj.x + x * cos - y * sin);
      ys.push(obj.y + x * sin + y * cos);
    }
  }
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

/** The area an object covers. Null when it draws nothing. */
export function canvasObjectBounds(
  obj: CanvasObject,
  measure: TextMeasurer = estimateTextSize,
): CanvasRect | null {
  const rect = unrotatedBounds(obj, measure);
  return rect && obj.rotation ? rotatedBounds(obj, rect) : rect;
}

/**
 * Points describe the centreline, but the ink sits either side of it — and a
 * pressure stroke can swell past half the nominal width — so the reach has to
 * be added or a wide stroke at the edge of the drawing gets clipped.
 */
function unrotatedBounds(
  obj: CanvasObject,
  measure: TextMeasurer,
): CanvasRect | null {
  switch (obj.type) {
    case 'path':
      return pathBounds(obj);
    case 'shape':
      return shapeBounds(obj);
    case 'text':
      return textBounds(obj, measure);
    case 'pin':
      return {
        x: obj.x - PIN_REACH,
        y: obj.y - PIN_REACH,
        width: PIN_REACH * 2,
        height: PIN_REACH * 2,
      };
    default:
      return {
        x: obj.x,
        y: obj.y,
        width: obj.width * (obj.scaleX || 1),
        height: obj.height * (obj.scaleY || 1),
      };
  }
}

function pointsBounds(
  obj: CanvasObject,
  points: number[],
  reach: number,
): CanvasRect | null {
  if (points.length < 2) return null;
  const scaleX = obj.scaleX || 1;
  const scaleY = obj.scaleY || 1;
  const b: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (let i = 0; i < points.length - 1; i += 2) {
    const x = obj.x + (points[i] ?? 0) * scaleX;
    const y = obj.y + (points[i + 1] ?? 0) * scaleY;
    b.minX = Math.min(b.minX, x - reach);
    b.minY = Math.min(b.minY, y - reach);
    b.maxX = Math.max(b.maxX, x + reach);
    b.maxY = Math.max(b.maxY, y + reach);
  }
  return {
    x: b.minX,
    y: b.minY,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  };
}

function pathBounds(obj: CanvasPath): CanvasRect | null {
  const reach = (obj.strokeWidth / 2) * (obj.pressures?.length ? 1.4 : 1);
  return pointsBounds(obj, obj.points, reach);
}

function shapeBounds(obj: CanvasShape): CanvasRect | null {
  if (obj.shapeType === 'line' || obj.shapeType === 'arrow') {
    return pointsBounds(obj, obj.points ?? [0, 0, obj.width, 0], 0);
  }
  if (obj.shapeType === 'polygon') {
    return pointsBounds(obj, obj.points ?? [], 0);
  }
  const width = obj.width * (obj.scaleX || 1);
  const height = obj.height * (obj.scaleY || 1);
  // Ellipses draw around their origin; everything else from the top-left.
  return obj.shapeType === 'ellipse'
    ? { x: obj.x - width / 2, y: obj.y - height / 2, width, height }
    : { x: obj.x, y: obj.y, width, height };
}

function textBounds(obj: CanvasText, measure: TextMeasurer): CanvasRect {
  const layout = layoutCanvasText(obj, measure);
  return {
    x: obj.x,
    y: obj.y,
    width: layout.width * (obj.scaleX || 1),
    height: layout.height * (obj.scaleY || 1),
  };
}

/** Compute SVG viewBox from visible objects across visible layers */
export function computeSvgViewBox(
  source: SvgSource,
  visibleLayers: CanvasLayer[],
  options: SvgOptions = {},
): SvgViewBox {
  const b: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const visibleLayerIds = new Set(visibleLayers.map((l) => l.id));
  for (const obj of source.objects) {
    if (!obj.visible) continue;
    // Pins are annotations rendered above every layer, regardless of layer
    // visibility — everything else follows its layer.
    if (obj.type !== 'pin' && !visibleLayerIds.has(obj.layerId)) continue;
    const rect = canvasObjectBounds(obj, options.measureText);
    if (!rect) continue;
    b.minX = Math.min(b.minX, rect.x);
    b.minY = Math.min(b.minY, rect.y);
    b.maxX = Math.max(b.maxX, rect.x + rect.width);
    b.maxY = Math.max(b.maxY, rect.y + rect.height);
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

/** Shadow and blend mode, which the canvas applies outside the object's transform. */
function objectEffects(obj: CanvasObject): { defs: string; attrs: string } {
  // Pins are annotations with a fixed look.
  if (obj.type === 'pin') return { defs: '', attrs: '' };
  let defs = '';
  let attrs = '';
  if (obj.shadow) {
    const { color, blur, offsetX, offsetY, opacity } = obj.shadow;
    const id = `shadow-${++svgIdCounter}`;
    // A canvas shadow's blur is twice the standard deviation of its Gaussian.
    defs = `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${offsetX}" dy="${offsetY}" stdDeviation="${blur / 2}" flood-color="${svgEsc(color)}" flood-opacity="${opacity ?? 1}"/></filter></defs>`;
    attrs += ` filter="url(#${id})"`;
  }
  if (obj.blendMode) {
    attrs += ` style="mix-blend-mode:${svgEsc(obj.blendMode)}"`;
  }
  return { defs, attrs };
}

/** Convert a CanvasObject to an SVG element string */
export function canvasObjectToSvgElement(
  obj: CanvasObject,
  options: SvgOptions = {},
): string {
  const tf = buildTransformAttr(obj);
  const element = canvasObjectToSvgShape(obj, tf, options);
  if (!element) return element;

  const { defs, attrs } = objectEffects(obj);
  const opacity = obj.opacity ?? 1;
  const opacityAttr = opacity < 1 ? ` opacity="${opacity}"` : '';
  if (!attrs && !opacityAttr) return element;
  return `${defs}<g${opacityAttr}${attrs}>${element}</g>`;
}

function canvasObjectToSvgShape(
  obj: CanvasObject,
  tf: string,
  options: SvgOptions,
): string {
  switch (obj.type) {
    case 'shape':
      return canvasShapeToSvg(obj, tf);
    case 'text':
      return canvasTextToSvg(obj, tf, options);
    case 'path':
      return canvasPathToSvg(obj, tf);
    case 'image':
      return canvasImageToSvg(obj, tf, options);
    case 'pin':
      return canvasPinToSvg(obj, tf, options);
    default:
      return '';
  }
}

/**
 * SVG `<defs>` + fill reference for a CSS gradient fill, or null for plain
 * colors. Gradient coordinates use objectBoundingBox fractions so they track
 * the shape without knowing its absolute geometry.
 */
function svgGradientFill(
  fill: string,
): { defs: string; fillRef: string } | null {
  const gradient = parseCssGradient(fill);
  if (!gradient) return null;

  const id = `grad-${++svgIdCounter}`;
  const stops = gradient.stops
    .map(
      (stop) =>
        `<stop offset="${Math.round(stop.offset * 1000) / 10}%" stop-color="${svgEsc(stop.color)}"/>`,
    )
    .join('');

  if (gradient.type === 'linear') {
    const { start, end } = linearGradientLine(gradient.angle, 1, 1, {
      x: 0.5,
      y: 0.5,
    });
    const defs = `<defs><linearGradient id="${id}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}">${stops}</linearGradient></defs>`;
    return { defs, fillRef: `url(#${id})` };
  }

  const defs = `<defs><radialGradient id="${id}" cx="0.5" cy="0.5" r="0.7071">${stops}</radialGradient></defs>`;
  return { defs, fillRef: `url(#${id})` };
}

/** A flat coordinate array as the value of an SVG `points` attribute. */
function pointsAttr(points: number[]): string {
  const pairs: string[] = [];
  for (let i = 0; i < points.length; i += 2) {
    pairs.push(`${points[i]},${points[i + 1]}`);
  }
  return pairs.join(' ');
}

/** Convert a line or arrow, whose head has a fixed size as on the canvas. */
function canvasLineToSvg(obj: CanvasShape, tf: string, dash: string): string {
  const points = pointsAttr(obj.points ?? [0, 0, obj.width, 0]);
  const stroke = svgEsc(obj.stroke);
  const line = `fill="none" stroke="${stroke}" stroke-width="${obj.strokeWidth}"${dash}`;
  if (obj.shapeType === 'line') {
    return `<polyline ${tf} points="${points}" ${line}/>`;
  }
  const marker = `arrow-${++svgIdCounter}`;
  const defs = `<defs><marker id="${marker}" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto"><polygon points="0 0,10 5,0 10" fill="${stroke}"/></marker></defs>`;
  return `${defs}<polyline ${tf} points="${points}" ${line} marker-end="url(#${marker})"/>`;
}

/** Convert a CanvasShape to its SVG element string */
export function canvasShapeToSvg(obj: CanvasShape, tf: string): string {
  const gradient = isGradientFill(obj.fill) ? svgGradientFill(obj.fill) : null;
  const fill = gradient?.fillRef ?? svgEsc(obj.fill ?? 'none');
  const gradientDefs = gradient?.defs ?? '';
  const base = `fill="${fill}" stroke="${svgEsc(obj.stroke)}" stroke-width="${obj.strokeWidth}"`;
  const dash = obj.dash?.length
    ? ` stroke-dasharray="${obj.dash.join(',')}"`
    : '';

  switch (obj.shapeType) {
    case 'rect': {
      const cr = obj.cornerRadius ? ` rx="${obj.cornerRadius}"` : '';
      return `${gradientDefs}<rect ${tf} width="${obj.width}" height="${obj.height}" ${base}${dash}${cr}/>`;
    }
    case 'ellipse': {
      // Ellipses draw around their origin, as on the canvas.
      const rx = obj.width / 2;
      const ry = obj.height / 2;
      return `${gradientDefs}<ellipse ${tf} rx="${rx}" ry="${ry}" ${base}${dash}/>`;
    }
    case 'line':
    case 'arrow':
      return canvasLineToSvg(obj, tf, dash);
    case 'polygon':
      return `${gradientDefs}<polygon ${tf} points="${pointsAttr(obj.points ?? [])}" ${base}${dash}/>`;
    default:
      return '';
  }
}

/** Where a line of text is anchored in its box, and how. */
function textAnchor(
  align: CanvasText['align'],
  boxWidth: number,
): { anchor: string; x: number } {
  if (align === 'center') return { anchor: 'middle', x: boxWidth / 2 };
  if (align === 'right') return { anchor: 'end', x: boxWidth };
  return { anchor: 'start', x: 0 };
}

/** Convert a CanvasText to an SVG text element, one tspan per line. */
export function canvasTextToSvg(
  obj: CanvasText,
  tf: string,
  options: SvgOptions = {},
): string {
  const layout = layoutCanvasText(obj, options.measureText ?? estimateTextSize);
  const { anchor, x } = textAnchor(obj.align, layout.width);
  const family = options.mapFontFamily?.(obj.fontFamily) ?? obj.fontFamily;
  const bold = obj.fontStyle.includes('bold') ? 'bold' : 'normal';
  const italic = obj.fontStyle.includes('italic') ? 'italic' : 'normal';

  const attrs = [
    tf,
    `fill="${svgEsc(obj.fill)}"`,
    `font-family="${svgEsc(family)}"`,
    `font-size="${obj.fontSize}"`,
    `font-weight="${bold}"`,
    `font-style="${italic}"`,
    `text-anchor="${anchor}"`,
    'xml:space="preserve"',
  ];
  if (obj.letterSpacing) attrs.push(`letter-spacing="${obj.letterSpacing}"`);
  if (obj.stroke && obj.strokeWidth) {
    attrs.push(
      `stroke="${svgEsc(obj.stroke)}"`,
      `stroke-width="${obj.strokeWidth}"`,
      'paint-order="stroke"',
    );
  }

  const lines = layout.lines
    .map((line, index) => {
      const y = layout.firstBaseline + index * layout.lineHeightPx;
      return `<tspan x="${x}" y="${y}">${svgEsc(line.text)}</tspan>`;
    })
    .join('');
  return `<text ${attrs.join(' ')}>${lines}</text>`;
}

/** Convert a CanvasPath to an SVG polyline element */
export function canvasPathToSvg(obj: CanvasPath, tf: string): string {
  if (obj.points.length < 4) return '';

  // Pressure ink is a filled outline, matching how it renders on the canvas.
  if (obj.pressures?.length) {
    const outline = buildInkOutline(obj.points, obj.pressures, obj.strokeWidth);
    const d = buildPathData(outline, 0, true);
    if (!d) return '';
    return `<path ${tf} d="${d}" fill="${svgEsc(obj.stroke)}" stroke="none"/>`;
  }

  const d = buildPathData(obj.points, obj.tension, obj.closed);
  if (!d) return '';
  const fill = obj.closed && obj.fill ? svgEsc(obj.fill) : 'none';
  return `<path ${tf} d="${d}" fill="${fill}" stroke="${svgEsc(obj.stroke)}" stroke-width="${obj.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const IMAGE_FIT: Record<NonNullable<CanvasImage['fit']>, string> = {
  fill: 'none',
  cover: 'xMidYMid slice',
  contain: 'xMidYMid meet',
};

/** Convert a CanvasImage to an SVG image or placeholder rect */
export function canvasImageToSvg(
  obj: CanvasImage,
  tf: string,
  options: SvgOptions = {},
): string {
  const href = options.resolveImage
    ? options.resolveImage(obj.src)
    : defaultImageSource(obj.src);
  const radius = obj.cornerRadius ?? 0;
  if (!href) {
    const rx = radius ? ` rx="${radius}"` : '';
    return `<rect ${tf} width="${obj.width}" height="${obj.height}" fill="#ccc" stroke="#999" stroke-width="1"${rx}/>`;
  }

  const size = `width="${obj.width}" height="${obj.height}"`;
  const fit = IMAGE_FIT[obj.fit ?? 'fill'];
  const image = (extra: string): string =>
    `<image ${tf} href="${svgEsc(href)}" ${size} preserveAspectRatio="${fit}"${extra}/>`;
  if (!radius) return image('');

  const clip = `image-clip-${++svgIdCounter}`;
  const clipped = image(` clip-path="url(#${clip})"`);
  return `<defs><clipPath id="${clip}"><rect ${size} rx="${radius}"/></clipPath></defs>${clipped}`;
}

function defaultImageSource(src: string): string | null {
  return src.startsWith('media:') ? null : src;
}

/** Convert a CanvasPin to an SVG circle marker with label */
export function canvasPinToSvg(
  obj: CanvasPin,
  tf: string,
  options: SvgOptions = {},
): string {
  const color = svgEsc(obj.color);
  const label =
    obj.label && options.pinLabels !== false
      ? `<text y="24" text-anchor="middle" font-size="12" fill="${color}">${svgEsc(obj.label)}</text>`
      : '';
  return `<g ${tf}><circle r="12" fill="${color}" stroke="#fff" stroke-width="2"/>${label}</g>`;
}

/** A rectangular export region in canvas world coordinates. */
export type SvgExportRegion = CanvasRect;

/**
 * Build a complete SVG document string from a canvas config.
 * Returns the SVG markup as a string.
 *
 * With a `region` (canvas size or crop frame) the viewBox is exactly that
 * rect — the SVG viewBox crops overhanging content naturally. Otherwise the
 * viewBox is fitted around the visible content as before.
 */
export function buildSvgDocument(
  source: SvgSource,
  region?: SvgExportRegion,
  options: SvgOptions = {},
): string {
  const visibleLayers = [...source.layers]
    .sort((a, b) => a.order - b.order)
    .filter((l) => l.visible);

  const { vX, vY, vW, vH } = region
    ? { vX: region.x, vY: region.y, vW: region.width, vH: region.height }
    : computeSvgViewBox(source, visibleLayers, options);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `  width="${vW}" height="${vH}" viewBox="${vX} ${vY} ${vW} ${vH}">`,
  ];

  // The page colour is part of the drawing: without it, light ink on a dark
  // page becomes light ink on whatever the viewer's background happens to be.
  if (source.background) {
    lines.push(
      `  <rect id="page" x="${vX}" y="${vY}" width="${vW}" height="${vH}" fill="${svgEsc(source.background)}"/>`,
    );
  }

  for (const layer of visibleLayers) {
    const layerObjs = source.objects.filter(
      (o) => o.layerId === layer.id && o.visible && o.type !== 'pin',
    );
    // Match the renderer: backgrounds always draw below the layer's objects.
    const objs = [
      ...layerObjs.filter((o) => isBackgroundImage(o)),
      ...layerObjs.filter((o) => !isBackgroundImage(o)),
    ];
    if (!objs.length) continue;
    // Each layer is its own canvas in the app, so a blend mode only mixes
    // with what is on its own layer.
    lines.push(
      `  <g id="${svgEsc(layer.id)}" opacity="${layer.opacity}" style="isolation:isolate">`,
    );
    for (const obj of objs) {
      lines.push('    ' + canvasObjectToSvgElement(obj, options));
    }
    lines.push('  </g>');
  }

  // Pins render above every layer, independent of layer visibility.
  const pins = source.objects.filter((o) => o.type === 'pin' && o.visible);
  if (pins.length > 0) {
    lines.push('  <g id="annotations">');
    for (const pin of pins) {
      lines.push('    ' + canvasObjectToSvgElement(pin, options));
    }
    lines.push('  </g>');
  }

  lines.push('</svg>');
  return lines.join('\n');
}
