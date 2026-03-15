import { describe, it, expect } from 'bun:test';
import {
  sanitizeSpaPath,
  shouldBypassSpa,
  findEmbeddedFile,
  guessMimeType,
  buildAssetHeaders,
} from '../src/utils/spa-utils';

describe('spa-utils', () => {
  describe('sanitizeSpaPath', () => {
    it('should return index.html for empty string', () => {
      expect(sanitizeSpaPath('')).toBe('index.html');
    });

    it('should return index.html for root path', () => {
      expect(sanitizeSpaPath('/')).toBe('index.html');
    });

    it('should return index.html for path with only slashes', () => {
      expect(sanitizeSpaPath('///')).toBe('index.html');
    });

    it('should strip leading slashes and return relative path', () => {
      expect(sanitizeSpaPath('/assets/main.js')).toBe('assets/main.js');
    });

    it('should filter out dot segments for path traversal prevention', () => {
      expect(sanitizeSpaPath('/../../../etc/passwd')).toBe('etc/passwd');
    });

    it('should filter out single dot segments', () => {
      expect(sanitizeSpaPath('/./assets/./main.js')).toBe('assets/main.js');
    });

    it('should decode URI-encoded segments', () => {
      expect(sanitizeSpaPath('/assets/my%20file.js')).toBe('assets/my file.js');
    });

    it('should handle invalid URI encoding gracefully', () => {
      expect(sanitizeSpaPath('/assets/%ZZinvalid')).toBe('assets/%ZZinvalid');
    });

    it('should trim whitespace from segments', () => {
      expect(sanitizeSpaPath('/ assets / main.js ')).toBe('assets/main.js');
    });
  });

  describe('shouldBypassSpa', () => {
    const prefixes = ['/api', '/health', '/lint'];

    it('should bypass exact prefix match', () => {
      expect(shouldBypassSpa('/api', prefixes)).toBe(true);
      expect(shouldBypassSpa('/health', prefixes)).toBe(true);
    });

    it('should bypass paths starting with prefix/', () => {
      expect(shouldBypassSpa('/api/v1/users', prefixes)).toBe(true);
      expect(shouldBypassSpa('/health/check', prefixes)).toBe(true);
    });

    it('should not bypass non-matching paths', () => {
      expect(shouldBypassSpa('/dashboard', prefixes)).toBe(false);
      expect(shouldBypassSpa('/about', prefixes)).toBe(false);
    });

    it('should not bypass partial prefix matches without slash', () => {
      expect(shouldBypassSpa('/api-docs', prefixes)).toBe(false);
      expect(shouldBypassSpa('/healthy', prefixes)).toBe(false);
    });

    it('should normalize multiple slashes', () => {
      expect(shouldBypassSpa('//api/v1/health', prefixes)).toBe(true);
      expect(shouldBypassSpa('///health///check', prefixes)).toBe(true);
    });
  });

  describe('findEmbeddedFile', () => {
    const files = new Map<string, string>([
      ['index.html', '<html>'],
      ['assets/main.js', 'console.log("hi")'],
      ['assets/style.css', 'body {}'],
    ]);

    it('should find file by exact path', () => {
      const result = findEmbeddedFile(files, 'assets/main.js');
      expect(result).toBeDefined();
      expect(result!.file).toBe('console.log("hi")');
      expect(result!.foundByBasename).toBe(false);
    });

    it('should find file by basename fallback', () => {
      const result = findEmbeddedFile(files, 'dist/assets/index.html');
      expect(result).toBeDefined();
      expect(result!.file).toBe('<html>');
      expect(result!.foundByBasename).toBe(true);
    });

    it('should return undefined for non-existent file', () => {
      expect(findEmbeddedFile(files, 'missing.txt')).toBeUndefined();
    });

    it('should prefer exact match over basename', () => {
      const result = findEmbeddedFile(files, 'index.html');
      expect(result).toBeDefined();
      expect(result!.foundByBasename).toBe(false);
    });
  });

  describe('guessMimeType', () => {
    it('should return correct MIME type for known extensions', () => {
      expect(guessMimeType('file.html')).toBe('text/html');
      expect(guessMimeType('file.css')).toBe('text/css');
      expect(guessMimeType('file.js')).toBe('application/javascript');
      expect(guessMimeType('file.json')).toBe('application/json');
      expect(guessMimeType('file.png')).toBe('image/png');
      expect(guessMimeType('file.jpg')).toBe('image/jpeg');
      expect(guessMimeType('file.jpeg')).toBe('image/jpeg');
      expect(guessMimeType('file.svg')).toBe('image/svg+xml');
      expect(guessMimeType('file.ico')).toBe('image/x-icon');
      expect(guessMimeType('file.webp')).toBe('image/webp');
      expect(guessMimeType('file.woff')).toBe('font/woff');
      expect(guessMimeType('file.woff2')).toBe('font/woff2');
      expect(guessMimeType('file.ttf')).toBe('font/ttf');
      expect(guessMimeType('file.wasm')).toBe('application/wasm');
    });

    it('should return octet-stream for unknown extensions', () => {
      expect(guessMimeType('file.xyz')).toBe('application/octet-stream');
      expect(guessMimeType('file.bin')).toBe('application/octet-stream');
    });

    it('should handle paths with directories', () => {
      expect(guessMimeType('assets/css/style.css')).toBe('text/css');
    });

    it('should be case-insensitive for extensions', () => {
      expect(guessMimeType('file.HTML')).toBe('text/html');
      expect(guessMimeType('file.JS')).toBe('application/javascript');
    });
  });

  describe('buildAssetHeaders', () => {
    it('should set Content-Type header', () => {
      const headers = buildAssetHeaders('text/css', 'style.css');
      expect(headers.get('Content-Type')).toBe('text/css');
    });

    it('should set immutable cache for non-index files', () => {
      const headers = buildAssetHeaders('application/javascript', 'assets/main.js');
      expect(headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    });

    it('should set no-cache for index.html', () => {
      const headers = buildAssetHeaders('text/html', 'index.html');
      expect(headers.get('Cache-Control')).toBe('no-cache');
    });

    it('should set Content-Encoding when encoding is provided', () => {
      const headers = buildAssetHeaders('application/wasm', 'file.wasm', 'br');
      expect(headers.get('Content-Encoding')).toBe('br');
    });

    it('should not set Content-Encoding when encoding is undefined', () => {
      const headers = buildAssetHeaders('text/css', 'style.css');
      expect(headers.get('Content-Encoding')).toBeNull();
    });
  });
});
