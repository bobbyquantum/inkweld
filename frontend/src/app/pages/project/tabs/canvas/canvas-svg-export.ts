import {
  buildSvgDocument,
  type CanvasFontSpec,
  type MeasuredText,
  type SvgExportRegion,
  type SvgOptions,
  type SvgSource,
  type TextMeasurer,
} from '@inkweld/canvas';

export { buildSvgDocument, type SvgExportRegion } from '@inkweld/canvas';

/**
 * Measure text with the browser's own fonts, as the canvas does, so an
 * exported SVG wraps where the canvas wraps. Null without a 2D context, in
 * which case the SVG builder falls back to an estimate.
 */
export function browserTextMeasurer(): TextMeasurer | undefined {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return undefined;
  return (text: string, font: CanvasFontSpec): MeasuredText => {
    const style = font.italic ? 'italic' : 'normal';
    const weight = font.bold ? 'bold' : 'normal';
    context.font = `${style} ${weight} ${font.size}px "${font.family}"`;
    const metrics = context.measureText(text);
    return {
      width: metrics.width,
      ascent: metrics.fontBoundingBoxAscent ?? font.size * 0.8,
      descent: metrics.fontBoundingBoxDescent ?? font.size * 0.2,
    };
  };
}

/** The options for an SVG this browser makes. */
export function browserSvgOptions(): SvgOptions {
  return { measureText: browserTextMeasurer() };
}

/**
 * Export the canvas config as an SVG file download.
 * Handles blob creation and browser download trigger.
 */
export function downloadSvg(
  config: SvgSource,
  elementName: string,
  region?: SvgExportRegion
): void {
  const svgContent = buildSvgDocument(config, region, browserSvgOptions());
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${elementName}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
