import { describe, expect, it } from 'vitest';

import { APP_PRIVACY_POLICY_PATH, DOCS_ORIGIN, docsUrl } from './docs-links';

describe('docsUrl', () => {
  it('points at the inkweld.org docs site', () => {
    expect(DOCS_ORIGIN).toBe('https://inkweld.org');
  });

  it('resolves a path against the docs site', () => {
    expect(docsUrl(APP_PRIVACY_POLICY_PATH)).toBe(
      'https://inkweld.org/privacy'
    );
    expect(docsUrl('/docs/installation/docker')).toBe(
      'https://inkweld.org/docs/installation/docker'
    );
  });
});
