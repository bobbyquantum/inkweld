import { describe, expect, it } from 'vitest';

import { PUBLISH_FONT_TOKENS, type PublishFontToken } from './publish-style';

// Bundled font families that ship under /assets/fonts/ in two formats:
//   - woff2 for browser CSS (copied by angular.json from @fontsource/*)
//   - ttf   for the Typst WASM compiler (downloaded by
//           scripts/fetch-publish-fonts.mjs during `bun install`)
// Keep this list in lockstep with `BUNDLED_TYPST_FONT_URLS` in
// `pdf-generator.service.ts` and the @font-face rules in
// `src/themes/_bundled-fonts.scss`. A drift here means PDF output (Typst)
// or screen rendering (CSS) will silently fall back to a system font.
const BUNDLED_FAMILIES = [
  'EB Garamond',
  'Source Serif 4',
  'Source Sans 3',
  'Lato',
  'Source Code Pro',
  'Courier Prime',
] as const;

describe('PUBLISH_FONT_TOKENS', () => {
  const tokens = Object.keys(PUBLISH_FONT_TOKENS) as PublishFontToken[];

  it('defines all six font tokens', () => {
    expect(tokens.sort()).toEqual(
      [
        'mono',
        'sansClean',
        'sansHumanist',
        'serifBook',
        'serifClassic',
        'serifManuscript',
      ].sort()
    );
  });

  it('every token resolves to a bundled Typst family', () => {
    for (const token of tokens) {
      const mapping = PUBLISH_FONT_TOKENS[token];
      expect(
        BUNDLED_FAMILIES,
        `Token ${token} maps Typst family ${mapping.typst} which is not bundled`
      ).toContain(mapping.typst as (typeof BUNDLED_FAMILIES)[number]);
    }
  });

  it('every token lists its bundled family first in the CSS stack', () => {
    for (const token of tokens) {
      const { css, typst } = PUBLISH_FONT_TOKENS[token];
      // CSS stack starts with the bundled family (quoted if it has spaces).
      const first = css
        .split(',')[0]
        .trim()
        .replace(/^["']|["']$/g, '');
      expect(
        first,
        `Token ${token}: CSS stack must start with ${typst} (got "${first}")`
      ).toBe(typst);
    }
  });

  it('every token has a non-empty human label', () => {
    for (const token of tokens) {
      expect(PUBLISH_FONT_TOKENS[token].label.trim().length).toBeGreaterThan(0);
    }
  });
});
