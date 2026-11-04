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
  const rpIdCases: Array<{
    name: string;
    env: Record<string, string | undefined>;
    expected: string;
  }> = [
    {
      name: 'uses the explicit WEBAUTHN_RP_ID env var when set',
      env: {
        WEBAUTHN_RP_ID: 'preview.inkweld.app',
        ALLOWED_ORIGINS: 'https://preview.inkweld.app',
      },
      expected: 'preview.inkweld.app',
    },
    {
      name: 'derives RP ID from ALLOWED_ORIGINS when env var is missing',
      env: { ALLOWED_ORIGINS: 'https://preview.inkweld.app' },
      expected: 'preview.inkweld.app',
    },
    {
      name: 'derives RP ID from ALLOWED_ORIGINS when env var is localhost',
      env: { WEBAUTHN_RP_ID: 'localhost', ALLOWED_ORIGINS: 'https://app.example.com' },
      expected: 'app.example.com',
    },
    {
      name: 'keeps localhost when ALLOWED_ORIGINS is wildcard',
      env: { WEBAUTHN_RP_ID: 'localhost', ALLOWED_ORIGINS: '*' },
      expected: 'localhost',
    },
    {
      name: 'keeps localhost when ALLOWED_ORIGINS is empty',
      env: { WEBAUTHN_RP_ID: 'localhost', ALLOWED_ORIGINS: '' },
      expected: 'localhost',
    },
    {
      name: 'keeps fallback when ALLOWED_ORIGINS has a malformed URL',
      env: { WEBAUTHN_RP_ID: 'localhost', ALLOWED_ORIGINS: 'not-a-url' },
      expected: 'localhost',
    },
    {
      name: 'uses first origin when multiple are configured',
      env: {
        WEBAUTHN_RP_ID: 'localhost',
        ALLOWED_ORIGINS: 'https://first.example.com,https://second.example.com',
      },
      expected: 'first.example.com',
    },
  ];

  describe('resolveRpId paths', () => {
    for (const { name, env, expected } of rpIdCases) {
      it(name, () => {
        const result = rpFromContext(mockContext(env));
        expect(result.rpId).toBe(expected);
      });
    }
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

    it('appends extra origins without duplicating configured ones', () => {
      const c = mockContext({
        WEBAUTHN_RP_ID: 'app.example.com',
        ALLOWED_ORIGINS: 'https://app.example.com,https://inkweld.app',
      });
      const result = rpFromContext(c, ['https://inkweld.app', 'https://extra.example.com']);
      expect(result.origins).toEqual([
        'https://app.example.com',
        'https://inkweld.app',
        'https://extra.example.com',
      ]);
    });

    it('throws for wildcard in production', () => {
      process.env['NODE_ENV'] = 'production';
      const c = mockContext({
        WEBAUTHN_RP_ID: 'app.example.com',
        ALLOWED_ORIGINS: '*',
      });
      expect(() => rpFromContext(c)).toThrow('ALLOWED_ORIGINS contains "*"');
    });

    it('throws for wildcard when the Workers binding says production', () => {
      // Workers keep NODE_ENV in the bindings; process.env does not see it.
      const c = mockContext({
        NODE_ENV: 'production',
        WEBAUTHN_RP_ID: 'app.example.com',
        ALLOWED_ORIGINS: '*',
      });
      expect(() => rpFromContext(c)).toThrow('ALLOWED_ORIGINS contains "*"');
    });

    it('throws for wildcard in every environment other than development and test', () => {
      const preview = mockContext({
        NODE_ENV: 'preview',
        WEBAUTHN_RP_ID: 'app.example.com',
        ALLOWED_ORIGINS: '*',
      });
      expect(() => rpFromContext(preview)).toThrow('ALLOWED_ORIGINS contains "*"');

      process.env['NODE_ENV'] = 'staging';
      const staging = mockContext({ WEBAUTHN_RP_ID: 'app.example.com', ALLOWED_ORIGINS: '*' });
      expect(() => rpFromContext(staging)).toThrow('NODE_ENV is "staging"');
    });

    it('returns request origin for wildcard when the binding says development', () => {
      process.env['NODE_ENV'] = 'production';
      const c = mockContext(
        { NODE_ENV: 'development', WEBAUTHN_RP_ID: 'localhost', ALLOWED_ORIGINS: '*' },
        'http://localhost:8787'
      );
      expect(rpFromContext(c).origins).toEqual(['http://localhost:8787']);
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
