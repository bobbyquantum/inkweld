import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const ICONS_DIR = join(PUBLIC, 'icons');
const SOURCE_SVG = join(ICONS_DIR, 'logo_source.svg');

// Configuration for different icon types
const ICONS = [
  { name: 'favicon-16x16.png', size: 16, folder: 'icons', transparent: true },
  { name: 'favicon-32x32.png', size: 32, folder: 'icons', transparent: true },
  { name: 'android-chrome-192x192.png', size: 192, folder: 'icons' },
  { name: 'android-chrome-512x512.png', size: 512, folder: 'icons' },
  { name: 'apple-touch-icon.png', size: 180, folder: 'icons', forceBackground: true }, // iOS needs background
  { name: 'logo.png', size: 512, folder: '.', transparent: true },
];

async function generateIcons() {
  const globalBgColor = process.argv[2]; // Optional background color from CLI
  
  console.log(`🚀 Generating icons from ${SOURCE_SVG}...`);
  if (globalBgColor) console.log(`🎨 Using global background color: ${globalBgColor}`);

  try {
    for (const icon of ICONS) {
      const targetPath = join(PUBLIC, icon.folder, icon.name);
      
      // Determine if this specific icon should have a background
      let finalBg = null;
      if (icon.forceBackground) {
        finalBg = globalBgColor || '#000000'; // Default to black if forced but no global color
      } else if (!icon.transparent && globalBgColor) {
        finalBg = globalBgColor;
      }
      
      let pipeline = sharp(SOURCE_SVG)
        .resize(icon.size, icon.size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        });

      if (finalBg) {
        console.log(`  -> ${icon.name} will have background: ${finalBg}`);
        // If background is requested, composite the logo over a solid color
        pipeline = sharp({
          create: {
            width: icon.size,
            height: icon.size,
            channels: 4,
            background: finalBg
          }
        }).composite([{
          input: await pipeline.toBuffer(),
          blend: 'over'
        }]);
      } else {
        console.log(`  -> ${icon.name} will be transparent`);
      }

      await pipeline.png().toFile(targetPath);
      console.log(`✅ Generated ${icon.name} (${icon.size}x${icon.size})`);
    }

    // Generate favicon.ico (includes multiple sizes)
    console.log('📦 Generating favicon.ico...');
    const icoSizes = [16, 32, 48];
    const icoBuffers = await Promise.all(
      icoSizes.map(size => 
        sharp(SOURCE_SVG)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
      )
    );
    
    const icoData = await pngToIco(icoBuffers);
    await writeFile(join(PUBLIC, 'favicon.ico'), icoData);
    console.log('✅ Generated favicon.ico');

    console.log('\n✨ All icons generated successfully!');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
