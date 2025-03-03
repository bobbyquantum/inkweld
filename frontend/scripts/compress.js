#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Recursively find all files in a directory
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

// Main function to compress files
function compressFiles() {
  const distDir = path.join(__dirname, '..', 'dist');

  // Check if dist directory exists
  if (!fs.existsSync(distDir)) {
    console.error(
      'Error: dist directory not found. Run build before compression.'
    );
    process.exit(1);
  }

  // Find all files
  const files = findFiles(distDir);
  console.log(`Found ${files.length} files to compress...`);

  // Compress each file
  let compressedCount = 0;
  for (const file of files) {
    try {
      // Read the file
      const content = fs.readFileSync(file);

      // Compress it using brotli with maximum compression level
      const compressedContent = zlib.brotliCompressSync(content, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]:
            zlib.constants.BROTLI_MAX_QUALITY,
        },
      });

      // Write the compressed file with .br extension
      fs.writeFileSync(`${file}.br`, compressedContent);
      compressedCount++;
      process.stdout.write(
        `\rCompressed ${compressedCount} of ${files.length} files...`
      );
    } catch (error) {
      console.error(`\nError compressing ${file}: ${error.message}`);
    }
  }

  console.log(
    `\nSuccessfully compressed ${compressedCount} of ${files.length} files.`
  );
}

// Run the compression
compressFiles();
