import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { rpFromContext } from '../src/utils/webauthn-utils';

type MockCtx = Parameters<typeof rpFromContext>[0];

function mockContext(env: Record<string, string | undefined>, originHeader?: string): MockCtx {
  return {
    env,
    req: {
      header: (name: string) => (name === 'origin' ? originHeader : undefined),
    },
  } as MockCtx;
}

const ORIGINAL_NODE_ENV = process.env['NODE_ENV'];

beforeEach(() => {
  process.env['NODE_ENV'] = 'test';
});

afterEach(() => {
  process.env['NODE_ENV'] = ORIGINAL_NODE_ENV;
});

describe('rpFromContext', () => {
  describe('resolveRpId paths', () => {
    it('uses the explicit WEBAUTHN_RP_ID env var when set', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'preview.inkweld.app',
        ALLOWED_ORIGINS: 'https://preview.inkweld.app',
      });
      const result = rpFromContext(c);
      expect(result.rpId).toBe('preview.inkweld.app');
    });

    it('derives RP ID from ALLOWED_ORIGINS when env var is missing', () => {
      const c = mockContext({
        ALLOWED_ORIGINS: 'https://preview.inkweld.app',
      });
      const result = rpFromContext(c);
      expect(result.rpId).toBe('preview.inkweld.app');
    });

    it('derives RP ID from ALLOWED_ORIGINS when env var is localhost', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'localhost',
        ALLOWED_ORIGINS: 'https://app.example.com',
      });
      const result = rpFromContext(c);
      expect(result.rpId).toBe('app.example.com');
    });

    it('keeps localhost when ALLOWED_ORIGINS is wildcard', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'localhost',
        ALLOWED_ORIGINS: '*',
      });
      const result = rpFromContext(c);
      expect(result.rpId).toBe('localhost');
    });

    it('keeps localhost when ALLOWED_ORIGINS is empty', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'localhost',
        ALLOWED_ORIGINS: '',
      });
      const result = rpFromContext(c);
      expect(result.rpId).toBe('localhost');
    });

    it('keeps fallback when ALLOWED_ORIGINS has a malformed URL', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'localhost',
        ALLOWED_ORIGINS: 'not-a-url',
      });
      const result = rpFromContext(c);
      expect(result.rpId).toBe('localhost');
    });

    it('uses first origin when multiple are configured', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'localhost',
        ALLOWED_ORIGINS: 'https://first.example.com,https://second.example.com',
      });
      const result = rpFromContext(c);
      expect(result.rpId).toBe('first.example.com');
    });
  });

  describe('resolveOrigins paths', () => {
    it('returns parsed origins as-is when no wildcard', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'app.example.com',
        ALLOWED_ORIGINS: 'https://app.example.com,https://other.example.com',
      });
      const result = rpFromContext(c);
      expect(result.origins).toEqual(['https://app.example.com', 'https://other.example.com']);
    });

    it('returns request origin for wildcard in non-production', () => {
      const c = mockContext(
        { WEBAUTHN_RP_ID: 'localhost', ALLOWED_ORIGINS: '*' },
        'http://localhost:4200'
      );
      const result = rpFromContext(c);
      expect(result.origins).toEqual(['http://localhost:4200']);
    });

    it('falls back to http://localhost for wildcard without request origin', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'localhost',
        ALLOWED_ORIGINS: '*',
      });
      const result = rpFromContext(c);
      expect(result.origins).toEqual(['http://localhost']);
    });

    it('throws for wildcard in production', () => {
      process.env['NODE_ENV'] = 'production';
      const c = mockContext({
        WEBAUTHN_RP_ID: 'app.example.com',
        ALLOWED_ORIGINS: '*',
      });
      expect(() => rpFromContext(c)).toThrow('ALLOWED_ORIGINS contains "*"');
    });
  });

  describe('rpName', () => {
    it('uses env var when set', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'app.example.com',
        WEBAUTHN_RP_NAME: 'My App',
        ALLOWED_ORIGINS: 'https://app.example.com',
      });
      const result = rpFromContext(c);
      expect(result.rpName).toBe('My App');
    });

    it('falls back to config default when env var is missing', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'app.example.com',
        ALLOWED_ORIGINS: 'https://app.example.com',
      });
      const result = rpFromContext(c);
      expect(result.rpName).toBe('Inkweld');
    });
  });
});
