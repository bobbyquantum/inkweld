import { and, eq, lt, gt } from 'drizzle-orm';
import * as oidc from 'openid-client';
import { oidcLoginTransactions } from '../db/schema/oidc-login-transactions';
import type { ConfigKey } from '../db/schema/config';
import type { DatabaseInstance } from '../types/context';
import { configService, ConfigValidationError, type ConfigValues } from './config.service';
import { logger } from './logger.service';

const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
export const OIDC_SETTING_KEYS = [
  'OIDC_ISSUER_URL',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_CALLBACK_URL',
] as const;
type OidcSetting = (typeof OIDC_SETTING_KEYS)[number];
const OIDC_CONFIG_KEYS = [...OIDC_SETTING_KEYS, 'OIDC_ONLY', 'OIDC_ENABLED'] as const;
type OidcConfigKey = (typeof OIDC_CONFIG_KEYS)[number];
type OidcClient = { configuration: oidc.Configuration; issuer: string; callbackUrl: string };

/** Identify keys whose writes must preserve a complete enabled OIDC configuration. */
export function isOidcConfigKey(key: ConfigKey): key is OidcConfigKey {
  return OIDC_CONFIG_KEYS.some((candidate) => candidate === key);
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isLoopback(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

/** Reject unsafe provider/callback URLs while allowing loopback-only HTTP for development. */
function parseConfiguredUrl(value: string, key: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) {
    throw new Error(`${key} must use HTTPS (HTTP is allowed only for localhost)`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${key} must not contain credentials, a query string, or a fragment`);
  }
  return url;
}

class OidcAuthService {
  private cachedClient?: { key: string; expiresAt: number; client: Promise<OidcClient> };

  /** Resolve provider settings and reject incomplete or unsafe OIDC configuration. */
  async validateConfiguration(
    db: DatabaseInstance,
    overrides: Partial<Record<OidcSetting, string>> = {}
  ) {
    const config = await configService.getMany(db, OIDC_SETTING_KEYS);
    return this.validateSettings(config, overrides);
  }

  /** Validate one consistent snapshot, including prospective admin edits. */
  private validateSettings(
    config: ConfigValues,
    overrides: Partial<Record<OidcSetting, string>> = {}
  ) {
    const issuerValue = (overrides.OIDC_ISSUER_URL ?? config.OIDC_ISSUER_URL.value).trim();
    const clientId = (overrides.OIDC_CLIENT_ID ?? config.OIDC_CLIENT_ID.value).trim();
    const clientSecret = overrides.OIDC_CLIENT_SECRET ?? config.OIDC_CLIENT_SECRET.value;
    const callbackValue = (overrides.OIDC_CALLBACK_URL ?? config.OIDC_CALLBACK_URL.value).trim();

    if (!issuerValue || !clientId || !clientSecret || !callbackValue) {
      throw new Error(
        'OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_CALLBACK_URL are required'
      );
    }

    const issuer = parseConfiguredUrl(issuerValue, 'OIDC_ISSUER_URL');
    const callbackUrl = parseConfiguredUrl(callbackValue, 'OIDC_CALLBACK_URL');
    return { issuer, clientId, clientSecret, callbackUrl };
  }

  /** Atomically preserve provider completeness for both normal and OIDC-only sign-in. */
  updateConfiguration(
    db: DatabaseInstance,
    key: OidcConfigKey,
    value: string | undefined
  ): Promise<void> {
    return configService.updateValidated(db, key, value, OIDC_CONFIG_KEYS, (values) => {
      if (
        ['true', '1'].includes(values.OIDC_ONLY.value) ||
        ['true', '1'].includes(values.OIDC_ENABLED.value)
      ) {
        try {
          this.validateSettings(values);
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          throw new ConfigValidationError(error.message);
        }
      }
    });
  }

  /** Reuse in-flight discovery for ten minutes, invalidating on any provider setting change. */
  private async getClient(db: DatabaseInstance): Promise<OidcClient> {
    const { issuer, clientId, clientSecret, callbackUrl } = await this.validateConfiguration(db);
    const key = await hash(JSON.stringify([issuer.href, clientId, clientSecret, callbackUrl.href]));
    if (this.cachedClient?.key === key && this.cachedClient.expiresAt > Date.now()) {
      return this.cachedClient.client;
    }
    const client = oidc
      .discovery(issuer, clientId, clientSecret, undefined, {
        timeout: 10,
        execute: isLoopback(issuer) ? [oidc.allowInsecureRequests] : [],
      })
      .then((configuration) => ({
        configuration,
        issuer: issuer.href,
        callbackUrl: callbackUrl.href,
      }));
    this.cachedClient = { key, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS, client };
    try {
      return await client;
    } catch (error) {
      if (this.cachedClient?.client === client) this.cachedClient = undefined;
      throw error;
    }
  }

  /** Delete expired state, nonce and PKCE records even if no further login starts. */
  async cleanupTransactions(db: DatabaseInstance): Promise<void> {
    await db.delete(oidcLoginTransactions).where(lt(oidcLoginTransactions.expiresAt, Date.now()));
  }

  /** Run an initial purge and an unreferenced hourly sweep on Bun/Node runtimes. */
  scheduleCleanup(db: DatabaseInstance): void {
    const run = () =>
      this.cleanupTransactions(db).catch((error) => {
        logger.warn('OIDCAuth', 'Authorization transaction cleanup failed', {
          error: String(error),
        });
      });
    void run();
    const timer = setInterval(run, 60 * 60 * 1000);
    timer.unref();
  }

  /** Persist a single-use PKCE transaction and build its state/nonce-bound authorization URL. */
  async createAuthorizationUrl(db: DatabaseInstance): Promise<URL> {
    const { configuration, callbackUrl } = await this.getClient(db);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const now = Date.now();

    await db.delete(oidcLoginTransactions).where(lt(oidcLoginTransactions.expiresAt, now));
    await db.insert(oidcLoginTransactions).values({
      stateHash: await hash(state),
      nonce,
      codeVerifier,
      expiresAt: now + TRANSACTION_TTL_MS,
    });

    return oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
  }

  /** Consume state once, exchange the code with PKCE and validate the ID token's identity. */
  async completeAuthorization(
    db: DatabaseInstance,
    state: string,
    authorizationResponseUrl: URL
  ): Promise<{ issuer: string; claims: oidc.IDToken }> {
    const now = Date.now();
    const stateHash = await hash(state);
    const [transaction] = await db
      .delete(oidcLoginTransactions)
      .where(
        and(
          eq(oidcLoginTransactions.stateHash, stateHash),
          gt(oidcLoginTransactions.expiresAt, now)
        )
      )
      .returning();

    if (!transaction) {
      throw new Error('OIDC authorization state is invalid or expired');
    }

    const { configuration, issuer, callbackUrl } = await this.getClient(db);
    const callbackResponse = new URL(callbackUrl);
    callbackResponse.search = authorizationResponseUrl.search;
    const tokens = await oidc.authorizationCodeGrant(configuration, callbackResponse, {
      expectedState: state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
    });
    const claims = tokens.claims();
    if (!claims?.sub || claims.iss !== issuer) {
      throw new Error('OIDC ID token is missing a valid issuer or subject');
    }
    return { issuer, claims };
  }
}

export const oidcAuthService = new OidcAuthService();
