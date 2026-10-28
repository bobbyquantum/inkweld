import { describe, expect, it } from 'vitest';

import {
  normalizeServerUrl,
  slugify,
  stripTrailingSlashes,
  trimHyphens,
} from './string-utils';

describe('stripTrailingSlashes', () => {
  it('should return unchanged string with no trailing slashes', () => {
    expect(stripTrailingSlashes('hello')).toBe('hello');
  });

  it('should strip a single trailing slash', () => {
    expect(stripTrailingSlashes('hello/')).toBe('hello');
  });

  it('should strip multiple trailing slashes', () => {
    expect(stripTrailingSlashes('hello///')).toBe('hello');
  });

  it('should not strip leading slashes', () => {
    expect(stripTrailingSlashes('/hello')).toBe('/hello');
  });

  it('should handle URL paths', () => {
    expect(stripTrailingSlashes('https://example.com/')).toBe(
      'https://example.com'
    );
    expect(stripTrailingSlashes('https://example.com/path/')).toBe(
      'https://example.com/path'
    );
  });

  it('should return empty string for all slashes', () => {
    expect(stripTrailingSlashes('///')).toBe('');
  });

  it('should handle empty string', () => {
    expect(stripTrailingSlashes('')).toBe('');
  });

  it('should preserve internal slashes', () => {
    expect(stripTrailingSlashes('a/b/c')).toBe('a/b/c');
  });
});

describe('trimHyphens', () => {
  it('should return unchanged string with no leading/trailing hyphens', () => {
    expect(trimHyphens('hello')).toBe('hello');
  });

  it('should trim leading hyphens', () => {
    expect(trimHyphens('--hello')).toBe('hello');
  });

  it('should trim trailing hyphens', () => {
    expect(trimHyphens('hello--')).toBe('hello');
  });

  it('should trim both leading and trailing hyphens', () => {
    expect(trimHyphens('---hello---')).toBe('hello');
  });

  it('should preserve internal hyphens', () => {
    expect(trimHyphens('hello-world')).toBe('hello-world');
  });

  it('should handle string of only hyphens', () => {
    expect(trimHyphens('---')).toBe('');
  });

  it('should handle empty string', () => {
    expect(trimHyphens('')).toBe('');
  });

  it('should handle single character', () => {
    expect(trimHyphens('-')).toBe('');
    expect(trimHyphens('a')).toBe('a');
  });

  it('should handle slug-like strings', () => {
    expect(trimHyphens('-my-project-name-')).toBe('my-project-name');
  });
});

describe('normalizeServerUrl', () => {
  it('adds https to a bare host', () => {
    expect(normalizeServerUrl(' api.inkweld.app/ ')).toBe(
      'https://api.inkweld.app'
    );
  });

  it('keeps an existing protocol', () => {
    expect(normalizeServerUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeServerUrl('HTTPS://example.com/')).toBe(
      'HTTPS://example.com'
    );
  });

  it('uses http for localhost', () => {
    expect(normalizeServerUrl('localhost:8333')).toBe('http://localhost:8333');
    expect(normalizeServerUrl('127.0.0.1:8333')).toBe('http://127.0.0.1:8333');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeServerUrl('  ')).toBe('');
  });
});

describe('slugify', () => {
  it('turns words into lowercase hyphenated slugs', () => {
    expect(slugify('My Test Project!')).toBe('my-test-project');
    expect(slugify('  --Tom & Jerry--  ')).toBe('tom-jerry');
  });

  it('keeps the base letter of accented characters', () => {
    expect(slugify('Café Dragons 🐉 Saga')).toBe('cafe-dragons-saga');
    expect(slugify('Señor Müller')).toBe('senor-muller');
  });

  it('spells out letters that do not decompose', () => {
    expect(slugify('Straße Ærø Łódź Œuvre')).toBe('strasse-aero-lodz-oeuvre');
  });

  it('drops apostrophes instead of splitting words', () => {
    expect(slugify("Ender's Game")).toBe('enders-game');
    expect(slugify('Ender’s Game')).toBe('enders-game');
  });

  it('returns an empty string when no Latin letters or digits remain', () => {
    expect(slugify('東京物語')).toBe('');
    expect(slugify('@#$%')).toBe('');
  });

  it('cuts at the maximum length without a trailing hyphen', () => {
    expect(slugify(`${'a'.repeat(49)} b`)).toBe('a'.repeat(49));
    expect(slugify('one two three', 7)).toBe('one-two');
  });
});
