import { Injectable } from '@angular/core';

/** Output size: the same 1:1.6 ratio as the bundled artwork. */
const COVER_WIDTH_PX = 1600;
const COVER_HEIGHT_PX = 2560;

/** Same darkening scrim the project cover component lays over the artwork. */
const SCRIM = 'rgba(0, 0, 0, 0.2)';

const FONT_STACK =
  '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Wrap `text` into lines no wider than `maxWidth`, breaking over-long words. */
export function wrapCoverText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number
): string[] {
  const lines: string[] = [];
  let line = '';
  const flush = (): void => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    flush();
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    // A single word wider than the cover: split it by character.
    for (const char of word) {
      if (line && measure(line + char) > maxWidth) flush();
      line += char;
    }
  }
  flush();
  return lines;
}

/**
 * Renders the placeholder cover shown on a project's home page — the bundled
 * artwork with the author and title over it — to a JPEG.
 *
 * That placeholder is only CSS (`ProjectCoverComponent`), not a stored media
 * file, so exports that need a real image file (EPUB) have to draw it
 * themselves.
 */
@Injectable({ providedIn: 'root' })
export class DefaultCoverRendererService {
  /** Resolves to null when no canvas is available or the artwork fails to load. */
  async render(title: string, author: string): Promise<Blob | null> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = COVER_WIDTH_PX;
      canvas.height = COVER_HEIGHT_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(0, 0, COVER_WIDTH_PX, COVER_HEIGHT_PX);
      const art = await this.loadArtwork();
      if (art) ctx.drawImage(art, 0, 0, COVER_WIDTH_PX, COVER_HEIGHT_PX);
      ctx.fillStyle = SCRIM;
      ctx.fillRect(0, 0, COVER_WIDTH_PX, COVER_HEIGHT_PX);

      this.drawText(ctx, title, author);

      return await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
    } catch {
      return null;
    }
  }

  private loadArtwork(): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = new URL('default_cover.webp', document.baseURI).href;
    });
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    title: string,
    author: string
  ): void {
    const maxWidth = COVER_WIDTH_PX * 0.8;
    const titleSize = 150;
    const authorSize = 80;
    const titleLead = titleSize * 1.25;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;

    ctx.font = `500 ${titleSize}px ${FONT_STACK}`;
    const titleLines = wrapCoverText(
      title || 'Untitled',
      maxWidth,
      s => ctx.measureText(s).width
    ).slice(0, 6);
    const blockHeight = titleLines.length * titleLead;
    const top = (COVER_HEIGHT_PX - blockHeight) / 2;
    titleLines.forEach((line, i) =>
      ctx.fillText(line, COVER_WIDTH_PX / 2, top + titleLead * (i + 0.5))
    );

    if (author) {
      ctx.font = `${authorSize}px ${FONT_STACK}`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const [authorLine] = wrapCoverText(
        author,
        maxWidth,
        s => ctx.measureText(s).width
      );
      ctx.fillText(authorLine, COVER_WIDTH_PX / 2, top - authorSize * 1.2);
    }
  }
}
