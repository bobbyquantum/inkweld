import { eq, and, lt } from 'drizzle-orm';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateRegistrationOptionsOpts,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { userPasskeys, webauthnChallenges } from '../db/schema';
import type { User, UserPasskey } from '../db/schema';
import type { DatabaseInstance } from '../types/context';
import { logger } from './logger.service';

const passkeyLog = logger.child('Passkey');

/** Challenges expire after 5 minutes */
const CHALLENGE_EXPIRY_SECONDS = 5 * 60;

export type PasskeyRpConfig = {
  rpId: string;
  rpName: string;
  /** Origins allowed to use these credentials, e.g. ['http://localhost:4200'] */
  origins: string[];
};

/**
 * Service for WebAuthn / passkey registration and authentication.
 *
 * Uses discoverable credentials (resident keys) so login is usernameless —
 * the authenticator returns the credential ID and we look up the owning user.
 *
 * Challenges are persisted in the database so they survive restarts and
 * scale across instances. They are single-use and expire after 5 minutes.
 */
class PasskeyService {
  // ─────────────────────────────────────────────────────────────────────────
  // Registration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate registration options for a logged-in user adding a new passkey.
   * Excludes credentials already registered to the user to prevent duplicates.
   */
  async startRegistration(
    db: DatabaseInstance,
    user: User,
    rp: PasskeyRpConfig
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await db.select().from(userPasskeys).where(eq(userPasskeys.userId, user.id));

    const opts: GenerateRegistrationOptionsOpts = {
      rpName: rp.rpName,
      rpID: rp.rpId,
      // userID must be a Uint8Array of stable bytes (not PII). The user.id
      // is a UUID string — encode it as bytes.
      userID: new TextEncoder().encode(user.id),
      userName: user.username || user.id,
      userDisplayName: user.name || user.username || 'User',
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: parseTransports(p.transports),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    };

    const options = await generateRegistrationOptions(opts);

    await this.saveChallenge(db, options.challenge, 'registration', user.id);

    return options;
  }

  /**
   * Verify a registration response and persist the new passkey.
   */
  async finishRegistration(
    db: DatabaseInstance,
    user: User,
    response: RegistrationResponseJSON,
    rp: PasskeyRpConfig,
    label?: string
  ): Promise<{ verified: boolean; passkey?: UserPasskey; error?: string }> {
    // Look up the challenge that was issued to this user. We allow any
    // unexpired registration challenge for this user — they're single-use.
    const challengeRecord = await this.takeChallengeByValue(
      db,
      response.response.clientDataJSON
        ? extractChallengeFromClientData(response.response.clientDataJSON)
        : '',
      'registration',
      user.id
    );

    if (!challengeRecord) {
      return { verified: false, error: 'Challenge not found or expired' };
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: rp.origins,
        expectedRPID: rp.rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      passkeyLog.warn('Registration verification failed', { err: String(err) });
      return { verified: false, error: 'Registration verification failed' };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { verified: false, error: 'Registration not verified' };
    }

    const info = verification.registrationInfo;
    // simplewebauthn v13 returns `credential` with id, publicKey (Uint8Array), counter, transports
    const cred = info.credential;
    const publicKeyB64 = uint8ToBase64Url(cred.publicKey);

    const insertValues = {
      userId: user.id,
      credentialId: cred.id,
      publicKey: publicKeyB64,
      counter: cred.counter ?? 0,
      transports: cred.transports ? JSON.stringify(cred.transports) : null,
      aaguid: info.aaguid ?? null,
      deviceType: info.credentialDeviceType ?? null,
      backedUp: info.credentialBackedUp ?? false,
      name: label ?? null,
    };

    await db.insert(userPasskeys).values(insertValues);

    const created = (
      await db.select().from(userPasskeys).where(eq(userPasskeys.credentialId, cred.id)).limit(1)
    )[0];

    return { verified: true, passkey: created };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate authentication options for usernameless (discoverable) login.
   * No allowCredentials list is sent — the authenticator picks any matching
   * resident credential.
   */
  async startAuthentication(
    db: DatabaseInstance,
    rp: PasskeyRpConfig
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await generateAuthenticationOptions({
      rpID: rp.rpId,
      userVerification: 'preferred',
      // Empty allowCredentials enables discoverable credential flow
      allowCredentials: [],
    });

    await this.saveChallenge(db, options.challenge, 'authentication', null);

    return options;
  }

  /**
   * Verify an authentication response and return the owning user (if any).
   */
  async finishAuthentication(
    db: DatabaseInstance,
    response: AuthenticationResponseJSON,
    rp: PasskeyRpConfig
  ): Promise<{
    verified: boolean;
    userId?: string;
    passkeyId?: string;
    error?: string;
  }> {
    // Find the credential by the ID returned from the authenticator
    const passkeyRecord = (
      await db
        .select()
        .from(userPasskeys)
        .where(eq(userPasskeys.credentialId, response.id))
        .limit(1)
    )[0];

    if (!passkeyRecord) {
      return { verified: false, error: 'Unknown credential' };
    }

    // Look up + consume the challenge from the request
    const expectedChallenge = extractChallengeFromClientData(response.response.clientDataJSON);
    const challengeRecord = await this.takeChallengeByValue(
      db,
      expectedChallenge,
      'authentication',
      null
    );
    if (!challengeRecord) {
      return { verified: false, error: 'Challenge not found or expired' };
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: rp.origins,
        expectedRPID: rp.rpId,
        credential: {
          id: passkeyRecord.credentialId,
          publicKey: base64UrlToUint8(passkeyRecord.publicKey) as Uint8Array<ArrayBuffer>,
          counter: passkeyRecord.counter,
          transports: parseTransports(passkeyRecord.transports),
        },
        requireUserVerification: false,
      });
    } catch (err) {
      passkeyLog.warn('Authentication verification failed', { err: String(err) });
      return { verified: false, error: 'Authentication verification failed' };
    }

    if (!verification.verified) {
      return { verified: false, error: 'Authentication not verified' };
    }

    // Update counter + last-used timestamp
    const newCounter = verification.authenticationInfo.newCounter;
    await db
      .update(userPasskeys)
      .set({
        counter: newCounter,
        lastUsedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(userPasskeys.id, passkeyRecord.id));

    return {
      verified: true,
      userId: passkeyRecord.userId,
      passkeyId: passkeyRecord.id,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Management
  // ─────────────────────────────────────────────────────────────────────────

  async listForUser(db: DatabaseInstance, userId: string): Promise<UserPasskey[]> {
    return db.select().from(userPasskeys).where(eq(userPasskeys.userId, userId));
  }

  async deleteForUser(db: DatabaseInstance, userId: string, passkeyId: string): Promise<boolean> {
    const result = await db
      .delete(userPasskeys)
      .where(and(eq(userPasskeys.id, passkeyId), eq(userPasskeys.userId, userId)));
    return affectedRows(result) > 0;
  }

  async renameForUser(
    db: DatabaseInstance,
    userId: string,
    passkeyId: string,
    name: string
  ): Promise<boolean> {
    const result = await db
      .update(userPasskeys)
      .set({ name })
      .where(and(eq(userPasskeys.id, passkeyId), eq(userPasskeys.userId, userId)));
    return affectedRows(result) > 0;
  }

  /**
   * Cleanup expired challenges. Called periodically.
   */
  async cleanupChallenges(db: DatabaseInstance): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now));
    return affectedRows(result);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────────────

  private async saveChallenge(
    db: DatabaseInstance,
    challenge: string,
    type: 'registration' | 'authentication',
    userId: string | null
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.insert(webauthnChallenges).values({
      challenge,
      type,
      userId,
      expiresAt: now + CHALLENGE_EXPIRY_SECONDS,
      createdAt: now,
    });
  }

  /**
   * Atomically claim a challenge by its raw value, then validate type/user/expiry.
   *
   * Uses `DELETE … RETURNING` so concurrent callers cannot consume the same row,
   * which would open a narrow replay window for WebAuthn challenges.
   */
  private async takeChallengeByValue(
    db: DatabaseInstance,
    challenge: string,
    type: 'registration' | 'authentication',
    userId: string | null
  ): Promise<{ challenge: string } | null> {
    if (!challenge) return null;

    const claimed = await db
      .delete(webauthnChallenges)
      .where(eq(webauthnChallenges.challenge, challenge))
      .returning();

    const record = claimed[0];
    if (!record) return null;
    if (record.type !== type) return null;

    const now = Math.floor(Date.now() / 1000);
    if (record.expiresAt < now) return null;

    if (type === 'registration') {
      if (!userId || record.userId !== userId) return null;
    }

    return { challenge: record.challenge };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the number of rows affected by a Drizzle mutation (delete/update).
 * Drizzle returns `changes` on Bun/better-sqlite3 and `rowsAffected` on D1,
 * so we check both to work across all runtimes.
 */
function affectedRows(result: unknown): number {
  const r = result as Record<string, unknown>;
  return (r?.['rowsAffected'] as number) ?? (r?.['changes'] as number) ?? 0;
}

function parseTransports(json: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as AuthenticatorTransportFuture[];
  } catch (err) {
    passkeyLog.warn('Failed to parse passkey transports', { json, err: String(err) });
  }
  return undefined;
}

function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  const b64 = typeof btoa === 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(binary);
  // Strip trailing '=' padding without a regex (avoids potential super-linear
  // backtracking on pathological inputs and addresses Sonar rule S5852).
  let end = b64.length;
  while (end > 0 && b64.codePointAt(end - 1) === 61 /* '=' */) end--;
  // Replace '+' -> '-' and '/' -> '_'.
  return b64.slice(0, end).replaceAll('+', '-').replaceAll('/', '_');
}

function base64UrlToUint8(b64url: string): Uint8Array {
  const b64 = b64url.replaceAll('-', '+').replaceAll('_', '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const padded = b64 + pad;
  if (typeof atob !== 'undefined') {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.codePointAt(i) ?? 0;
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/**
 * The clientDataJSON returned by the authenticator is base64url-encoded.
 * It contains the challenge as a base64url string. We extract it without
 * pulling in any extra dependency.
 */
function extractChallengeFromClientData(clientDataJSONB64Url: string): string {
  try {
    const bytes = base64UrlToUint8(clientDataJSONB64Url);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as { challenge?: string };
    return parsed.challenge ?? '';
  } catch {
    return '';
  }
}

export const passkeyService = new PasskeyService();
