/**
 * Compresses static assets with Brotli for deployment.
 *
 * 1. For WASM files > 25MB: REPLACES the original with compressed version (for Cloudflare Pages limit).
 * 2. For other assets: Creates a .br sidecar file for servers that support pre-compressed assets.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const DIST_DIR = path.join(__dirname, '..', 'dist', 'browser');
const NGSW_PATH = path.join(DIST_DIR, 'ngsw.json');
const SIZE_LIMIT_MB = 25;

// Extensions to compress
const COMPRESS_EXTENSIONS = [
  '.js',
  '.css',
  '.html',
  '.json',
  '.wasm',
  '.svg',
  '.xml',
  '.webmanifest',
];

function findFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function compressAssets() {
  if (!fs.existsSync(DIST_DIR)) {
    console.log('No dist directory found at', DIST_DIR);
    process.exit(0);
  }

  // Load ngsw.json if it exists to update hashes for in-place replacements
  let ngsw = null;
  if (fs.existsSync(NGSW_PATH)) {
    ngsw = JSON.parse(fs.readFileSync(NGSW_PATH, 'utf8'));
    console.log('Loaded ngsw.json for hash updates...');
  }

  const files = findFiles(DIST_DIR);
  console.log(`Found ${files.length} files to check...`);

  let compressedCount = 0;
  let replacedCount = 0;

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!COMPRESS_EXTENSIONS.includes(ext) || filePath.endsWith('.br')) {
      continue;
    }

    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    const content = fs.readFileSync(filePath);

    // Compress with Brotli
    const compressed = zlib.brotliCompressSync(content, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]:
          zlib.constants.BROTLI_MAX_QUALITY,
      },
    });

    // If it's a WASM file, we REPLACE it in-place
    // This ensures we stay under Cloudflare's 25MB limit and simplifies headers
    if (ext === '.wasm') {
      console.log(`\n${path.relative(DIST_DIR, filePath)}: ${sizeMB.toFixed(2)} MB`);
      if (sizeMB > SIZE_LIMIT_MB) {
        console.log(`  ⚠️  Exceeds ${SIZE_LIMIT_MB}MB limit - REPLACING original...`);
      } else {
        console.log(`  ✓ Compressing in-place...`);
      }
      fs.writeFileSync(filePath, compressed);
      replacedCount++;

      // Update hash in ngsw.json
      if (ngsw && ngsw.hashTable) {
        const relativePath = '/' + path.relative(DIST_DIR, filePath).replace(/\\/g, '/');
        if (ngsw.hashTable[relativePath]) {
          const newHash = crypto.createHash('sha1').update(compressed).digest('hex');
          ngsw.hashTable[relativePath] = newHash;
          console.log(`  Updated hash in ngsw.json for ${relativePath}`);
        }
      }
    } else {
      // Otherwise, create a .br sidecar file
      const brPath = `${filePath}.br`;
      fs.writeFileSync(brPath, compressed);
      compressedCount++;
    }
  }

  // Save updated ngsw.json
  if (ngsw) {
    fs.writeFileSync(NGSW_PATH, JSON.stringify(ngsw, null, 2));
    console.log('\n✅ Updated ngsw.json with new hashes');
  }

  console.log(`\n✅ Done!`);
  console.log(`   - Created ${compressedCount} .br sidecar files`);
  console.log(`   - Replaced ${replacedCount} large WASM files`);
}

compressAssets();
