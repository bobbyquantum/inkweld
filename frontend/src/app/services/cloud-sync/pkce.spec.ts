import { describe, expect, it } from 'vitest';

import {
  base64UrlEncode,
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce';

describe('pkce helpers', () => {
  describe('base64UrlEncode', () => {
    it('produces unpadded base64url', () => {
      // "hello" => aGVsbG8= in base64; url-safe drops the padding
      expect(base64UrlEncode(new TextEncoder().encode('hello'))).toBe(
        'aGVsbG8'
      );
    });

    it('replaces + and / with - and _', () => {
      // 0xfb 0xff => "+/8=" in standard base64
      expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    });

    it('accepts an ArrayBuffer', () => {
      const bytes = new TextEncoder().encode('abc');
      expect(base64UrlEncode(bytes.buffer)).toBe('YWJj');
    });
  });

  describe('generateCodeVerifier', () => {
    it('uses only RFC 7636 unreserved characters at the requested length', () => {
      const verifier = generateCodeVerifier(64);
      expect(verifier).toHaveLength(64);
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('clamps the length into the 43..128 range', () => {
      expect(generateCodeVerifier(10)).toHaveLength(43);
      expect(generateCodeVerifier(500)).toHaveLength(128);
    });

    it('is random', () => {
      expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
    });
  });

  describe('computeCodeChallenge', () => {
    it('matches the RFC 7636 appendix B example', async () => {
      const challenge = await computeCodeChallenge(
        'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
      );
      expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });
  });

  describe('generateState', () => {
    it('is url-safe and unique per call', () => {
      const state = generateState();
      expect(state).toMatch(/^[A-Za-z0-9\-_]+$/);
      expect(state.length).toBeGreaterThanOrEqual(24);
      expect(generateState()).not.toBe(state);
    });
  });
});
