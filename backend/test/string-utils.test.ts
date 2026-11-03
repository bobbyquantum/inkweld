import { describe, it, expect } from 'bun:test';
import { stripTrailingSlashes, trimCharacters, trimHyphens } from '../src/utils/string-utils';

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
    expect(stripTrailingSlashes('https://example.com/')).toBe('https://example.com');
    expect(stripTrailingSlashes('https://example.com/path/')).toBe('https://example.com/path');
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

describe('trimCharacters', () => {
  it('should trim any of the given characters from both ends', () => {
    expect(trimCharacters('-_-hello_-_', '-_')).toBe('hello');
  });

  it('should preserve those characters inside the string', () => {
    expect(trimCharacters('-a_b-c_', '-_')).toBe('a_b-c');
  });

  it('should leave other characters alone', () => {
    expect(trimCharacters('.hello.', '-_')).toBe('.hello.');
  });

  it('should return an empty string when nothing else is left', () => {
    expect(trimCharacters('-__-', '-_')).toBe('');
    expect(trimCharacters('', '-_')).toBe('');
  });
});
