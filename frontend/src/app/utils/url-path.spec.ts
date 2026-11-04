import { describe, expect, it } from 'vitest';

import { encodePathSegment } from './url-path';

/** The path a browser requests for `/api/<segment>/end`. */
function requestedPath(segment: string): string {
  return new URL(`https://inkweld.test/api/${encodePathSegment(segment)}/end`)
    .pathname;
}

describe('encodePathSegment', () => {
  it('leaves ids, usernames and slugs unchanged', () => {
    expect(encodePathSegment('alice')).toBe('alice');
    expect(encodePathSegment('my-novel')).toBe('my-novel');
    expect(encodePathSegment('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(
      '0f8fad5b-d9cb-469f-a165-70867728950e'
    );
    expect(encodePathSegment('cover-1711638400000.jpg')).toBe(
      'cover-1711638400000.jpg'
    );
  });

  it('encodes characters that are not plain segment characters', () => {
    expect(encodePathSegment('My Picture.png')).toBe('My%20Picture.png');
    expect(encodePathSegment('50%off')).toBe('50%25off');
  });

  it.each([
    '../x',
    'a/b',
    '%2e%2e/x',
    '..%2fx',
    '..\\x',
    'x?y',
    'x#y',
    '.\t.',
    '...',
  ])('keeps %j in one segment', value => {
    const path = requestedPath(value);
    expect(path.startsWith('/api/')).toBe(true);
    expect(path.endsWith('/end')).toBe(true);
    expect(path.split('/')).toHaveLength(4);
  });

  it.each(['.', '..'])('refuses the dot segment %j', value => {
    expect(() => encodePathSegment(value)).toThrow();
  });

  // Each row is wrapped, since it.each spreads array rows into arguments.
  it.each([[['..']], [['.']], [null], [undefined], [42]])(
    'refuses a value that is not a string: %j',
    (value: unknown) => {
      expect(() => encodePathSegment(value as string)).toThrow();
    }
  );
});
