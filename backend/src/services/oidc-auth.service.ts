import { and, eq, lt, gt } from 'drizzle-orm';
import * as oidc from 'openid-client';
import { oidcLoginTransactions } from '../db/schema/oidc-login-transactions';
import type { DatabaseInstance } from '../types/context';
import { configService } from './config.service';

const TRANSACTION_TTL_MS = 10 * 60 * 1000;

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isLoopback(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

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
  private async getClient(db: DatabaseInstance) {
    const config = await configService.getMany(db, [
      'OIDC_ISSUER_URL',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_CALLBACK_URL',
    ] as const);
    const issuerValue = config.OIDC_ISSUER_URL.value.trim();
    const clientId = config.OIDC_CLIENT_ID.value.trim();
    const clientSecret = config.OIDC_CLIENT_SECRET.value;
    const callbackValue = config.OIDC_CALLBACK_URL.value.trim();

    if (!issuerValue || !clientId || !clientSecret || !callbackValue) {
      throw new Error(
        'OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_CALLBACK_URL are required'
      );
    }

    const issuer = parseConfiguredUrl(issuerValue, 'OIDC_ISSUER_URL');
    const callbackUrl = parseConfiguredUrl(callbackValue, 'OIDC_CALLBACK_URL');
    const configuration = await oidc.discovery(issuer, clientId, clientSecret, undefined, {
      timeout: 10,
      execute: isLoopback(issuer) ? [oidc.allowInsecureRequests] : [],
    });

    return { configuration, issuer: issuer.href, callbackUrl: callbackUrl.href };
  }

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
