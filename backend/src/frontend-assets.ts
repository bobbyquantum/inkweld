/**
 * Frontend asset imports for embedding in binary
 * This file imports all frontend assets so they get embedded in the compiled binary
 */

// Import index.html and all generated chunks
// These will be available via Bun.embeddedFiles at runtime
import indexHtml from '../../frontend/dist/browser/index.html' with { type: 'file' };

// Export a function to get all embedded assets
export function getFrontendAssets(): Map<string, string> {
  const assets = new Map<string, string>();
  assets.set('index.html', indexHtml);
  return assets;
}

// Note: Other files (JS, CSS, images) are automatically embedded when passed to bun build
