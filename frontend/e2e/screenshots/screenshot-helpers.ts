import { Locator, Page } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

export function getScreenshotsDir(...segments: string[]): string {
  return join(
    process.cwd(),
    '..',
    'docs',
    'site',
    'static',
    'img',
    'features',
    ...segments
  );
}

export async function ensureDirectory(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

export async function captureElementScreenshot(
  page: Page,
  elements: Locator[],
  path: string,
  padding = 24
): Promise<void> {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];

  for (const element of elements) {
    if (await element.isVisible().catch(() => false)) {
      const box = await element.boundingBox();
      if (box) {
        boxes.push(box);
      }
    }
  }

  if (boxes.length === 0) {
    await page.screenshot({ path, fullPage: false });
    return;
  }

  const minX = Math.max(0, Math.min(...boxes.map(b => b.x)) - padding);
  const minY = Math.max(0, Math.min(...boxes.map(b => b.y)) - padding);
  const maxX = Math.max(...boxes.map(b => b.x + b.width)) + padding;
  const maxY = Math.max(...boxes.map(b => b.y + b.height)) + padding;

  const viewport = page.viewportSize();
  const clipWidth = Math.min(maxX - minX, (viewport?.width || 1280) - minX);
  const clipHeight = Math.min(maxY - minY, (viewport?.height || 800) - minY);

  if (clipWidth <= 0 || clipHeight <= 0) {
    await page.screenshot({ path, fullPage: false });
    return;
  }

  await page.screenshot({
    path,
    clip: {
      x: minX,
      y: minY,
      width: clipWidth,
      height: clipHeight,
    },
  });
}
