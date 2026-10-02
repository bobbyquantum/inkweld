import { describe, expect, it } from 'bun:test';
import {
  base64UrlEncode,
  generateSecureRandom,
  hashString,
  verifyPkce,
} from '../src/utils/oauth-crypto';

describe('oauth-crypto', () => {
  it('generateSecureRandom returns an alphanumeric string of the requested length', () => {
    const value = generateSecureRandom(48);
    expect(value).toHaveLength(48);
    expect(value).toMatch(/^[A-Za-z0-9]+$/);
    expect(generateSecureRandom(48)).not.toBe(value);
  });

  it('hashString returns the hex SHA-256 digest', async () => {
    expect(await hashString('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('base64UrlEncode uses the URL-safe alphabet without padding', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x01]);
    expect(base64UrlEncode(bytes.buffer)).toBe('-__-AQ');
  });

  it('verifyPkce accepts the RFC 7636 example and rejects a wrong verifier', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(await verifyPkce(verifier, challenge)).toBe(true);
    expect(await verifyPkce('wrong', challenge)).toBe(false);
  });
});
