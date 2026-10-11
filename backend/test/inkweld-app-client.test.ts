/**
 * ALLOW_INKWELD_APP_CLIENT: one switch that lets the hosted inkweld.app
 * client (and the Android app) sign in to this server — CORS, WebAuthn
 * expected origins and /.well-known/webauthn.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { startTestServer, stopTestServer } from './server-test-helper';
import { getDatabase } from '../src/db/index';
import { configService } from '../src/services/config.service';
import {
  clearInkweldAppClientCache,
  getInkweldAppClientOrigins,
  INKWELD_APP_CLIENT_ORIGINS,
} from '../src/services/inkweld-app-client.service';
import { rpFromRequest } from '../src/utils/webauthn-utils';
import type { DatabaseInstance } from '../src/types/context';

const INKWELD_APP = 'https://inkweld.app';

async function setSwitch(enabled: boolean | null): Promise<void> {
  const db = getDatabase();
  if (enabled === null) {
    await configService.delete(db, 'ALLOW_INKWELD_APP_CLIENT');
  } else {
    await configService.set(db, 'ALLOW_INKWELD_APP_CLIENT', enabled ? 'true' : 'false');
  }
  clearInkweldAppClientCache();
}

describe('ALLOW_INKWELD_APP_CLIENT', () => {
  let baseUrl: string;

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await setSwitch(null);
  });

  afterAll(async () => {
    await stopTestServer();
  });

  function preflight(origin: string): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/config/features`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
      },
    });
  }

  describe('when off (the default)', () => {
    it('does not trust inkweld.app for CORS', async () => {
      const response = await preflight(INKWELD_APP);
      expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe(INKWELD_APP);
    });

    it('does not serve /.well-known/webauthn', async () => {
      const response = await fetch(`${baseUrl}/.well-known/webauthn`);
      expect(response.status).toBe(404);
    });

    it('returns no extra origins', async () => {
      expect(await getInkweldAppClientOrigins(getDatabase())).toEqual([]);
    });
  });

  describe('when on', () => {
    it('trusts inkweld.app for CORS', async () => {
      await setSwitch(true);
      const response = await preflight(INKWELD_APP);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(INKWELD_APP);
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('still refuses other origins', async () => {
      await setSwitch(true);
      const response = await preflight('https://evil.example');
      expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example');
    });

    it('lists inkweld.app in /.well-known/webauthn', async () => {
      await setSwitch(true);
      const response = await fetch(`${baseUrl}/.well-known/webauthn`);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      expect(await response.json()).toEqual({ origins: [INKWELD_APP] });
    });

    it('serves /.well-known/webauthn to any origin', async () => {
      await setSwitch(true);
      const response = await fetch(`${baseUrl}/.well-known/webauthn`, {
        headers: { Origin: INKWELD_APP },
      });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('adds inkweld.app to the WebAuthn expected origins', async () => {
      await setSwitch(true);
      const db = getDatabase();
      const c = {
        env: {
          ALLOWED_ORIGINS: 'https://writer.example.com',
          WEBAUTHN_RP_ID: 'writer.example.com',
        },
        req: { header: () => undefined },
        get: (key: string) => (key === 'db' ? db : undefined),
      } as unknown as Parameters<typeof rpFromRequest>[0];

      const rp = await rpFromRequest(c);
      expect(rp.rpId).toBe('writer.example.com');
      expect(rp.origins).toEqual(['https://writer.example.com', INKWELD_APP]);
    });
  });

  describe('getInkweldAppClientOrigins', () => {
    it('trusts nothing extra without a database', async () => {
      expect(await getInkweldAppClientOrigins(undefined)).toEqual([]);
    });

    it('caches the value until cleared', async () => {
      const db = getDatabase();
      await setSwitch(true);
      expect(await getInkweldAppClientOrigins(db)).toEqual(INKWELD_APP_CLIENT_ORIGINS);

      // Written without clearing the cache: the cached value still applies
      await configService.set(db, 'ALLOW_INKWELD_APP_CLIENT', 'false');
      expect(await getInkweldAppClientOrigins(db)).toEqual(INKWELD_APP_CLIENT_ORIGINS);

      clearInkweldAppClientCache();
      expect(await getInkweldAppClientOrigins(db)).toEqual([]);
    });

    it('trusts nothing extra when the config cannot be read', async () => {
      clearInkweldAppClientCache();
      const broken = {
        select: () => {
          throw new Error('database unavailable');
        },
      } as unknown as DatabaseInstance;
      expect(await getInkweldAppClientOrigins(broken)).toEqual([]);
    });
  });
});
