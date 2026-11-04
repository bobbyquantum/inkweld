import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  chooseSigningKey,
  DEV_FALLBACK_SECRET,
  isDevOnlyNodeEnv,
  PUBLISHED_KEYS,
  SAMPLE_SECRETS,
  signingKeyProblem,
} from '../src/config/env';
import { SigningSecretError, signingSecret } from '../src/config/signing-secret';

/**
 * Guards against a signing key published in this repository (the development
 * key, or a sample value from the docs) ever being used outside
 * development/test.
 *
 * `config.databaseKey` is resolved once at module load, so the boot-time
 * behaviour is exercised by importing the module in a child Bun process with
 * a controlled environment rather than by mutating `process.env` in-process.
 */

const ENV_MODULE = join(import.meta.dir, '../src/config/env.ts');
const WORKERS_FIXTURE = join(import.meta.dir, 'fixtures/workers-signing-key.ts');

/** Run `cmd` from `/` with only PATH plus `env`, so no .env file or shell secret leaks in. */
function runIsolated(
  cmd: string[],
  env: Record<string, string | undefined>
): { exitCode: number; stdout: string; stderr: string } {
  const childEnv: Record<string, string> = { PATH: process.env.PATH ?? '' };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) childEnv[key] = value;
  }
  const result = Bun.spawnSync({
    cmd,
    // env.ts also loads .env files from cwd / parents; run from / so only the
    // explicit environment above is visible.
    cwd: '/',
    env: childEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function bootWith(env: Record<string, string | undefined>): { exitCode: number; stderr: string } {
  return runIsolated([process.execPath, '-e', `await import(${JSON.stringify(ENV_MODULE)})`], env);
}

/** Bundle `entry` with `process.env.NODE_ENV` replaced, as `bun build` and Wrangler do. */
async function bundleWithNodeEnv(entry: string, outdir: string, nodeEnv: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: 'bun',
    minify: true,
    define: { 'process.env.NODE_ENV': JSON.stringify(nodeEnv) },
  });
  expect(result.success).toBe(true);
  return result.outputs[0].path;
}

const STRONG_SECRET = 'a-perfectly-adequate-secret-with-32-plus-chars';
const SAMPLE_SECRET = 'placeholder-set-via-wrangler-secret';

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
    expect(stderr).toContain('SESSION_SECRET must be at least 32 characters');
  });

  it('refuses a short DATABASE_KEY even when SESSION_SECRET is long enough', () => {
    // Stricter than the per-request rule: on Bun and Node this key also
    // encrypts stored settings.
    const { exitCode, stderr } = bootWith({
      NODE_ENV: 'production',
      DATABASE_KEY: 'too-short',
      SESSION_SECRET: STRONG_SECRET,
      WEBAUTHN_RP_ID: 'example.com',
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('DATABASE_KEY must be at least 32 characters');
  });

  it('refuses the built-in development key as the configured secret outside development', () => {
    const { exitCode, stderr } = bootWith({
      NODE_ENV: 'production',
      SESSION_SECRET: DEV_FALLBACK_SECRET,
      WEBAUTHN_RP_ID: 'example.com',
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('SESSION_SECRET is set to the built-in development key');
  });

  it('refuses a sample value from the docs as the configured secret outside development', () => {
    const { exitCode, stderr } = bootWith({
      NODE_ENV: 'production',
      SESSION_SECRET: SAMPLE_SECRET,
      WEBAUTHN_RP_ID: 'example.com',
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(
      'SESSION_SECRET is set to a sample value from the Inkweld documentation'
    );
  });

  it('accepts a sample value from the docs in development', () => {
    const { exitCode, stderr } = bootWith({
      NODE_ENV: 'development',
      SESSION_SECRET: SAMPLE_SECRET,
    });
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('public development fallback');
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

  it('treats an empty NODE_ENV as development', () => {
    const { exitCode, stderr } = bootWith({ NODE_ENV: '' });
    expect(exitCode).toBe(0);
    expect(stderr).toContain('public development fallback');
  });

  it('keeps the published keys long enough that only the environment check refuses them', () => {
    // Every published key clears the 32-char length check on its own, which is
    // why the environment allow-list, not the length check, is what keeps them
    // out of real deployments.
    for (const key of PUBLISHED_KEYS) {
      expect(key.length).toBeGreaterThanOrEqual(32);
    }
  });
});

/**
 * The Docker image and `build:binary` bundle the server, and Bun's bundler
 * replaces `process.env.NODE_ENV` with its value at build time. A bundle built
 * with "development" in place must still apply the checks for the NODE_ENV it
 * is started with.
 */
describe('config.databaseKey boot guard in a bundle', () => {
  let dir: string;
  let bundle: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'inkweld-env-bundle-'));
    bundle = await bundleWithNodeEnv(ENV_MODULE, dir, 'development');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to start in production without a secret', () => {
    const { exitCode, stderr } = runIsolated([process.execPath, bundle], {
      NODE_ENV: 'production',
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('DATABASE_KEY or SESSION_SECRET must be set');
  });

  it('refuses to start in production without WEBAUTHN_RP_ID', () => {
    const { exitCode, stderr } = runIsolated([process.execPath, bundle], {
      NODE_ENV: 'production',
      SESSION_SECRET: STRONG_SECRET,
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('WEBAUTHN_RP_ID must be set');
  });

  it('starts in production with a strong secret', () => {
    const { exitCode, stderr } = runIsolated([process.execPath, bundle], {
      NODE_ENV: 'production',
      SESSION_SECRET: STRONG_SECRET,
      WEBAUTHN_RP_ID: 'example.com',
    });
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('public development fallback');
  });
});

describe('signingKeyProblem', () => {
  it('accepts a long enough key in every environment', () => {
    for (const env of ['production', 'preview', 'development', 'test', undefined]) {
      expect(signingKeyProblem(STRONG_SECRET, env)).toBeUndefined();
    }
  });

  it('allows no key, or a published key, only in development and test', () => {
    for (const env of ['development', 'test', '', undefined]) {
      expect(signingKeyProblem(undefined, env)).toBeUndefined();
      for (const key of PUBLISHED_KEYS) {
        expect(signingKeyProblem(key, env)).toBeUndefined();
      }
    }
    for (const env of ['production', 'preview', 'staging']) {
      expect(signingKeyProblem(undefined, env)).toContain('must be set');
      expect(signingKeyProblem(DEV_FALLBACK_SECRET, env, 'SESSION_SECRET')).toContain(
        'SESSION_SECRET is set to the built-in development key'
      );
      for (const key of SAMPLE_SECRETS) {
        expect(signingKeyProblem(key, env, 'DATABASE_KEY')).toContain(
          'DATABASE_KEY is set to a sample value from the Inkweld documentation'
        );
      }
    }
  });

  it('refuses a short key in every environment without repeating it', () => {
    for (const env of ['production', 'development', 'test']) {
      const problem = signingKeyProblem('short-key-value', env);
      expect(problem).toContain('at least 32 characters');
      expect(problem).not.toContain('short-key-value');
    }
  });
});

describe('chooseSigningKey', () => {
  it('uses DATABASE_KEY, then SESSION_SECRET, then the development key in development', () => {
    const databaseKey = 'd'.repeat(32);
    expect(
      chooseSigningKey({ DATABASE_KEY: databaseKey, SESSION_SECRET: STRONG_SECRET }, 'production')
    ).toEqual({ key: databaseKey });
    expect(chooseSigningKey({ SESSION_SECRET: STRONG_SECRET }, 'production')).toEqual({
      key: STRONG_SECRET,
    });
    expect(chooseSigningKey({}, 'development')).toEqual({ key: DEV_FALLBACK_SECRET });
  });

  it('signs with SESSION_SECRET, and warns, when DATABASE_KEY is only too short', () => {
    const choice = chooseSigningKey(
      { DATABASE_KEY: 'short', SESSION_SECRET: STRONG_SECRET },
      'production'
    );
    expect(choice).toEqual({
      key: STRONG_SECRET,
      warning: expect.stringContaining('DATABASE_KEY'),
    });
    expect(JSON.stringify(choice)).not.toContain('"short"');
  });

  it('refuses a short DATABASE_KEY when SESSION_SECRET cannot be used either', () => {
    for (const SESSION_SECRET of [undefined, 'also-short', DEV_FALLBACK_SECRET, SAMPLE_SECRET]) {
      const choice = chooseSigningKey({ DATABASE_KEY: 'short', SESSION_SECRET }, 'production');
      expect(choice).toEqual({
        problem: expect.stringContaining('DATABASE_KEY has fewer than 32 characters'),
      });
      // DATABASE_KEY also encrypts stored settings: ask for a SESSION_SECRET, not a new key
      expect(choice).toEqual({
        problem: expect.stringContaining('Keep it, because it encrypts stored settings'),
      });
      expect(choice).toEqual({ problem: expect.stringContaining('set SESSION_SECRET') });
    }
  });

  it('never passes over a published DATABASE_KEY outside development and test', () => {
    const choice = chooseSigningKey(
      { DATABASE_KEY: SAMPLE_SECRET, SESSION_SECRET: STRONG_SECRET },
      'production'
    );
    expect(choice).toEqual({
      problem: expect.stringContaining('DATABASE_KEY is set to a sample value'),
    });
  });

  it('ignores values that are not non-empty strings', () => {
    expect(
      chooseSigningKey({ DATABASE_KEY: '', SESSION_SECRET: STRONG_SECRET }, 'production')
    ).toEqual({ key: STRONG_SECRET });
    expect(
      chooseSigningKey({ DATABASE_KEY: 42, SESSION_SECRET: STRONG_SECRET }, 'production')
    ).toEqual({ key: STRONG_SECRET });
  });
});

describe('signingSecret', () => {
  it('uses DATABASE_KEY from the bindings, then SESSION_SECRET', () => {
    const databaseKey = 'd'.repeat(32);
    const sessionSecret = 's'.repeat(32);
    expect(signingSecret({ DATABASE_KEY: databaseKey, SESSION_SECRET: sessionSecret })).toBe(
      databaseKey
    );
    expect(signingSecret({ SESSION_SECRET: sessionSecret })).toBe(sessionSecret);
  });

  it('treats an empty DATABASE_KEY binding as unset', () => {
    const sessionSecret = 's'.repeat(32);
    expect(signingSecret({ DATABASE_KEY: '', SESSION_SECRET: sessionSecret })).toBe(sessionSecret);
  });

  it('signs with SESSION_SECRET when the DATABASE_KEY binding is only too short', () => {
    const bindings = {
      NODE_ENV: 'production',
      DATABASE_KEY: 'short',
      SESSION_SECRET: STRONG_SECRET,
    };
    expect(signingSecret(bindings)).toBe(STRONG_SECRET);
  });

  it('refuses a short DATABASE_KEY binding without a usable SESSION_SECRET', () => {
    const bindings = { NODE_ENV: 'production', DATABASE_KEY: 'short' };
    expect(() => signingSecret(bindings)).toThrow(SigningSecretError);
    expect(() => signingSecret(bindings)).toThrow('DATABASE_KEY has fewer than 32 characters');
  });

  it('refuses the published keys outside development and test', () => {
    for (const key of PUBLISHED_KEYS) {
      for (const NODE_ENV of ['production', 'preview']) {
        expect(() => signingSecret({ NODE_ENV, SESSION_SECRET: key })).toThrow(SigningSecretError);
      }
      for (const NODE_ENV of ['development', 'test']) {
        expect(signingSecret({ NODE_ENV, SESSION_SECRET: key })).toBe(key);
      }
    }
  });

  it('names the error so the error handler can recognise it', () => {
    expect(new SigningSecretError('x').name).toBe('SigningSecretError');
  });
});

/**
 * Cloudflare Workers keep secrets in the request bindings only, so there is
 * no start-up check: each path that needs the key must refuse on its own.
 * The fixture runs in a child process so env.ts sees a Workers runtime from
 * its first import.
 */
describe('on Cloudflare Workers', () => {
  type Outcome = { value: unknown } | { error: string };
  type Report = {
    processKeyIsDevelopmentKey: boolean;
    scenarios: Record<string, Record<string, Outcome>>;
  };
  let report: Report;
  let stderr: string;
  let bundledReport: Report;
  let dir: string;

  function runFixture(path: string): { report: Report; stderr: string } {
    const result = runIsolated([process.execPath, path], {});
    if (result.exitCode !== 0) throw new Error(`Workers fixture failed: ${result.stderr}`);
    const lines = result.stdout.trim().split('\n');
    return { report: JSON.parse(lines.at(-1) ?? '{}') as Report, stderr: result.stderr };
  }

  beforeAll(async () => {
    ({ report, stderr } = runFixture(WORKERS_FIXTURE));
    // Wrangler writes the NODE_ENV of the shell it runs in into the bundle.
    dir = mkdtempSync(join(tmpdir(), 'inkweld-workers-bundle-'));
    ({ report: bundledReport } = runFixture(
      await bundleWithNodeEnv(WORKERS_FIXTURE, dir, 'development')
    ));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const refused = { error: 'SigningSecretError' };
  const allRefused = {
    signingSecret: refused,
    createSession: refused,
    devKeySession: refused,
    sampleKeySession: refused,
    configuredKeySession: refused,
    mcpSigningSecret: refused,
    mcpAccessToken: refused,
  };
  const signsWithConfiguredKey = {
    signingSecret: { value: 'configured key' },
    createSession: { value: 'string' },
    devKeySession: { value: null },
    sampleKeySession: { value: null },
    configuredKeySession: { value: 'user-1' },
    mcpSigningSecret: { value: 'configured key' },
    mcpAccessToken: { value: null },
  };

  it('skips the start-up check, so the process holds only the development key', () => {
    expect(report.processKeyIsDevelopmentKey).toBe(true);
  });

  it.each(['production', 'preview', 'unset'])(
    'refuses every signing path when no key is set and NODE_ENV is %s',
    (name) => {
      expect(report.scenarios[name]).toEqual(allRefused);
    }
  );

  it.each(['development', 'test'])(
    'uses the development key when no key is set and NODE_ENV is %s',
    (name) => {
      expect(report.scenarios[name]).toEqual({
        signingSecret: { value: 'development key' },
        createSession: { value: 'string' },
        devKeySession: { value: 'user-1' },
        sampleKeySession: { value: null },
        configuredKeySession: { value: null },
        mcpSigningSecret: { value: 'development key' },
        mcpAccessToken: { value: 'user-1' },
      });
    }
  );

  it('signs and verifies with SESSION_SECRET when it is set', () => {
    expect(report.scenarios.sessionSecret).toEqual(signsWithConfiguredKey);
  });

  it('signs with SESSION_SECRET when DATABASE_KEY is only too short, and warns once', () => {
    expect(report.scenarios.shortDatabaseKey).toEqual(signsWithConfiguredKey);
    expect(stderr.split('DATABASE_KEY is shorter than 32 characters').length - 1).toBe(1);
  });

  it('refuses a short DATABASE_KEY without a usable SESSION_SECRET', () => {
    expect(report.scenarios.shortDatabaseKeyOnly).toEqual(allRefused);
  });

  it.each(['sampleSecret', 'sampleSecretUnset'])(
    'refuses a sample value from the docs as the secret (%s)',
    (name) => {
      expect(report.scenarios[name]).toEqual(allRefused);
    }
  );

  it('accepts a sample value from the docs in development', () => {
    expect(report.scenarios.sampleSecretDevelopment).toEqual({
      signingSecret: { value: 'sample key' },
      createSession: { value: 'string' },
      devKeySession: { value: null },
      sampleKeySession: { value: 'user-1' },
      configuredKeySession: { value: null },
      mcpSigningSecret: { value: 'sample key' },
      mcpAccessToken: { value: null },
    });
  });

  it('decides the same way when the bundle was built with NODE_ENV=development', () => {
    expect(bundledReport.scenarios.unset).toEqual(allRefused);
    expect(bundledReport.scenarios.sampleSecretUnset).toEqual(allRefused);
    expect(bundledReport).toEqual(report);
  });
});
