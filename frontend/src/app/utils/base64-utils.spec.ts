import { describe, expect, it } from 'vitest';

import { base64ToBlob } from './base64-utils';

describe('base64ToBlob', () => {
  it('should convert raw base64 string to Blob with default PNG mime type', () => {
    const rawBase64 = btoa('hello world');
    const blob = base64ToBlob(rawBase64);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('should convert data URL with PNG mime type', () => {
    const base64 = btoa('png-image-data');
    const dataUrl = `data:image/png;base64,${base64}`;
    const blob = base64ToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('should convert data URL with JPEG mime type', () => {
    const base64 = btoa('jpeg-image-data');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    const blob = base64ToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('should convert data URL with GIF mime type', () => {
    const base64 = btoa('gif-image-data');
    const dataUrl = `data:image/gif;base64,${base64}`;
    const blob = base64ToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/gif');
  });

  it('should convert data URL with WebP mime type', () => {
    const base64 = btoa('webp-image-data');
    const dataUrl = `data:image/webp;base64,${base64}`;
    const blob = base64ToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
  });

  it('should convert data URL with SVG mime type', () => {
    const base64 = btoa('svg-image-data');
    const dataUrl = `data:image/svg+xml;base64,${base64}`;
    const blob = base64ToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/svg+xml');
  });

  it('should handle data URL with charset parameter', () => {
    const base64 = btoa('text-data');
    const dataUrl = `data:text/plain;charset=utf-8;base64,${base64}`;
    const blob = base64ToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
  });

  it('should handle empty-ish base64 string', () => {
    const base64 = btoa('');
    const blob = base64ToBlob(base64);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(0);
  });

  it('should preserve binary content correctly', () => {
    const original = new Uint8Array([0, 128, 255, 64, 32]);
    let binaryString = '';
    for (let i = 0; i < original.length; i++) {
      binaryString += String.fromCodePoint(original[i]);
    }
    const base64 = btoa(binaryString);
    const blob = base64ToBlob(base64);

    const reader = new FileReader();
    return new Promise<void>(resolve => {
      reader.onloadend = () => {
        const result = new Uint8Array(reader.result as ArrayBuffer);
        expect(result).toEqual(original);
        resolve();
      };
      reader.readAsArrayBuffer(blob);
    });
  });
});
