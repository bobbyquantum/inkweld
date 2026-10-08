import { describe, expect, it } from 'vitest';

import { docsOrigin, docsUrl } from './docs-links';

describe('docsOrigin', () => {
  it('pairs a hosted inkweld.app deployment with its inkweld.org docs', () => {
    expect(docsOrigin('inkweld.app')).toBe('https://inkweld.org');
    expect(docsOrigin('preview.inkweld.app')).toBe(
      'https://preview.inkweld.org'
    );
  });

  it('falls back to the default docs for any other host', () => {
    expect(docsOrigin('localhost')).toBe('https://preview.inkweld.org');
    expect(docsOrigin('writing.example.com')).toBe(
      'https://preview.inkweld.org'
    );
    expect(docsOrigin('notinkweld.app')).toBe('https://preview.inkweld.org');
    expect(docsOrigin('')).toBe('https://preview.inkweld.org');
  });
});

describe('docsUrl', () => {
  it('resolves a path against the docs for the current host', () => {
    expect(docsUrl('/privacy')).toBe(
      docsOrigin(globalThis.location.hostname) + '/privacy'
    );
  });
});
