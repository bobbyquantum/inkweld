/**
 * Regenerate the Android launcher icons from the PWA source SVG.
 *
 * Why this exists:
 *   Android adaptive icons render the foreground drawable inside a 108dp x 108dp
 *   viewport, but only the inner 72dp x 72dp (66%) "safe zone" is guaranteed to
 *   be visible. Launcher masks (circle, squircle, rounded square) and parallax
 *   crop the outer ~18% on every side. The previous foreground PNG filled the
 *   full 432x432 canvas edge-to-edge, so the logo looked "zoomed in" and got
 *   clipped by the mask. This script re-renders the foreground (and the legacy
 *   mipmap PNGs) with the logo scaled to the safe zone and centered on a
 *   transparent (foreground) or solid-color (legacy mipmap) background.
 *
 * Outputs:
 *   android/app/src/main/res/drawable/ic_launcher_foreground.png  (432x432, transparent, logo at 66%)
 *   android/app/src/main/res/mipmap-mdpi/ic_launcher{,_round}.png   (48x48,  solid #006874 bg)
 *   android/app/src/main/res/mipmap-hdpi/ic_launcher{,_round}.png   (72x72,  solid #006874 bg)
 *   android/app/src/main/res/mipmap-xhdpi/ic_launcher{,_round}.png  (96x96,  solid #006874 bg)
 *   android/app/src/main/res/mipmap-xxhdpi/ic_launcher{,_round}.png (144x144,solid #006874 bg)
 *   android/app/src/main/res/mipmap-xxxhdpi/ic_launcher{,_round}.png(192x192,solid #006874 bg)
 *
 * Usage:
 *   bun run frontend/scripts/generate-android-icons.ts
 */
import sharp from 'sharp';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const PROJECT_ROOT = join(FRONTEND_ROOT, '..');
const SOURCE_SVG = join(FRONTEND_ROOT, 'public', 'icons', 'logo_source.svg');
const RES_DIR = join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res');

// Brand background color (matches android/app/src/main/res/values/colors.xml primary_color).
const PRIMARY_COLOR = '#006874';

// Android adaptive-icon safe zone: the foreground drawable is 108dp x 108dp, but
// only the inner 66dp x 66dp (~0.6111) is guaranteed visible. We scale the logo
// to 66% of the canvas and center it, leaving transparent padding so OEM masks
// and parallax don't crop the artwork. 0.66 matches Google's guidance and keeps
// the logo visually consistent with the PWA icon.
const SAFE_ZONE_RATIO = 0.66;

// Foreground drawable: 108dp @ xxxhdpi (4x) = 432px, transparent background.
const FOREGROUND_SIZE = 432;

// Legacy launcher icons (pre-API 26 fallback). These are full-bleed icons with
// the brand color background; the logo is still kept within the safe zone so
// round icons don't crop it. Densities follow the standard Android scale.
const MIPMAP_SIZES: Array<{ folder: string; size: number }> = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

async function renderLogoAt(size: number): Promise<Buffer> {
  // Render the SVG to a square PNG of `size` px with transparent background.
  return sharp(SOURCE_SVG)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function makeForeground(): Promise<void> {
  const target = FOREGROUND_SIZE;
  const logoSize = Math.round(target * SAFE_ZONE_RATIO);
  const offset = Math.round((target - logoSize) / 2);

  const logo = await renderLogoAt(logoSize);

  // Composite the scaled logo centered on a fully transparent 432x432 canvas.
  const out = await sharp({
    create: {
      width: target,
      height: target,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, blend: 'over', left: offset, top: offset }])
    .png()
    .toBuffer();

  const dest = join(RES_DIR, 'drawable', 'ic_launcher_foreground.png');
  await writeFile(dest, out);
  console.log(`ic_launcher_foreground.png -> ${target}x${target} (logo ${logoSize}x${logoSize} centered)`);
}

async function makeMipmap(folder: string, size: number): Promise<void> {
  const logoSize = Math.round(size * SAFE_ZONE_RATIO);
  const offset = Math.round((size - logoSize) / 2);

  const logo = await renderLogoAt(logoSize);

  // Legacy icons use the solid brand color as the background (no adaptive layer).
  const out = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: PRIMARY_COLOR,
    },
  })
    .composite([{ input: logo, blend: 'over', left: offset, top: offset }])
    .png()
    .toBuffer();

  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await writeFile(join(RES_DIR, folder, name), out);
  }
  console.log(`${folder}/ic_launcher{,_round}.png -> ${size}x${size} (logo ${logoSize}x${logoSize} on ${PRIMARY_COLOR})`);
}

async function main(): Promise<void> {
  console.log(`Generating Android launcher icons from ${SOURCE_SVG}`);
  console.log(`  safe-zone ratio: ${SAFE_ZONE_RATIO}`);

  await makeForeground();
  for (const { folder, size } of MIPMAP_SIZES) {
    await makeMipmap(folder, size);
  }

  console.log('\nAll Android launcher icons generated.');
}

main().catch((err) => {
  console.error('Failed to generate Android icons:', err);
  process.exit(1);
});