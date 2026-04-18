import { describe, expect, it } from 'vitest';

import { generateUserColor } from './user-color';

describe('generateUserColor', () => {
  it('returns a stable color for the same username', () => {
    const a = generateUserColor('alice');
    const b = generateUserColor('alice');
    expect(a).toBe(b);
  });

  it('returns different colors for different usernames', () => {
    const a = generateUserColor('alice');
    const b = generateUserColor('bob');
    expect(a).not.toBe(b);
  });

  it('returns a valid 7-character hex color', () => {
    const color = generateUserColor('alice');
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns a fallback color for an empty username', () => {
    expect(generateUserColor('')).toBe('#9e9e9e');
  });

  it('handles unicode characters without throwing', () => {
    expect(() => generateUserColor('🦊emoji')).not.toThrow();
    expect(generateUserColor('🦊emoji')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
