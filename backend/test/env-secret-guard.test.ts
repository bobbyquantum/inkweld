import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { DEV_FALLBACK_SECRET, isDevOnlyNodeEnv } from '../src/config/env';

/**
 * Guards against the well-known development signing secret ever being used
 * outside development/test.
 *
 * `config.databaseKey` is resolved once at module load, so the boot-time
 * behaviour is exercised by importing the module in a child Bun process with
 * a controlled environment rather than by mutating `process.env` in-process.
 */

const ENV_MODULE = join(import.meta.dir, '../src/config/env.ts');

function bootWith(env: Record<string, string | undefined>): { exitCode: number; stderr: string } {
  // Start from a clean environment so a developer's own .env / shell
  // SESSION_SECRET can't leak into the child and mask a failure.
  const childEnv: Record<string, string> = { PATH: process.env.PATH ?? '' };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) childEnv[key] = value;
  }
  const result = Bun.spawnSync({
    cmd: [process.execPath, '-e', `await import(${JSON.stringify(ENV_MODULE)})`],
    // env.ts also loads .env files from cwd / parents; run from an empty temp
    // dir so only the explicit environment above is visible.
    cwd: '/',
    env: childEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

const STRONG_SECRET = 'a-perfectly-adequate-secret-with-32-plus-chars';

describe('isDevOnlyNodeEnv', () => {
  it('allows only development and test (unset counts as development)', () => {
    expect(isDevOnlyNodeEnv(undefined)).toBe(true);
    expect(isDevOnlyNodeEnv('')).toBe(true);
    expect(isDevOnlyNodeEnv('development')).toBe(true);
    expect(isDevOnlyNodeEnv('test')).toBe(true);
  });

  it('rejects every other value, not just "production"', () => {
    for (const env of ['production', 'staging', 'preview', 'prod', 'Development', 'dev']) {
      expect(isDevOnlyNodeEnv(env)).toBe(false);
    }
  });
});

describe('config.databaseKey boot guard', () => {
  it('refuses to start in production without a secret', () => {
    const { exitCode, stderr } = bootWith({ NODE_ENV: 'production' });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('DATABASE_KEY or SESSION_SECRET must be set');
  });

  it('refuses to start in a non-development environment that is not "production"', () => {
    const { exitCode, stderr } = bootWith({ NODE_ENV: 'staging' });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('DATABASE_KEY or SESSION_SECRET must be set');
  });

  it('refuses a short secret outside development', () => {
    const { exitCode, stderr } = bootWith({ NODE_ENV: 'production', SESSION_SECRET: 'too-short' });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('at least 32 characters');
  });

  it('starts with a strong secret outside development', () => {
    // WEBAUTHN_RP_ID has its own production boot check; satisfy it so this
    // test only exercises the secret guard.
    const { exitCode } = bootWith({
      NODE_ENV: 'production',
      SESSION_SECRET: STRONG_SECRET,
      WEBAUTHN_RP_ID: 'example.com',
    });
    expect(exitCode).toBe(0);
  });

  it('falls back to the development key only in development, with a warning', () => {
    const { exitCode, stderr } = bootWith({ NODE_ENV: 'development' });
    expect(exitCode).toBe(0);
    expect(stderr).toContain('public development fallback');
  });

  it('keeps the well-known fallback long enough to be obviously not a real secret guard', () => {
    // The fallback clears the 32-char length check on its own, which is why
    // the environment allow-list above — not the length check — is what keeps
    // it out of real deployments.
    expect(DEV_FALLBACK_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
