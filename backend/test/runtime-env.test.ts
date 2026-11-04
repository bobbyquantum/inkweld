import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configuredNodeEnv,
  isCloudflareWorkers,
  isDevelopmentOrTest,
  runtimeEnv,
} from '../src/config/runtime-env';

const RUNTIME_ENV_MODULE = join(import.meta.dir, '../src/config/runtime-env.ts');
const g = globalThis as Record<string, unknown>;

/** Run `fn` with NODE_ENV set to `value` (undefined: unset), then restore it. */
function withNodeEnv<T>(value: string | undefined, fn: () => T): T {
  const original = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
}

/** Run `fn` with the globals that identify Cloudflare Workers defined. */
function asWorkers<T>(fn: () => T): T {
  const hadCaches = 'caches' in g;
  const hadPair = 'WebSocketPair' in g;
  const savedCaches = g.caches;
  const savedPair = g.WebSocketPair;
  g.caches = g.caches ?? {};
  g.WebSocketPair = class {};
  try {
    return fn();
  } finally {
    if (hadCaches) g.caches = savedCaches;
    else delete g.caches;
    if (hadPair) g.WebSocketPair = savedPair;
    else delete g.WebSocketPair;
  }
}

describe('configuredNodeEnv', () => {
  it('prefers the request bindings over the process environment', () => {
    withNodeEnv('development', () => {
      expect(configuredNodeEnv({ NODE_ENV: 'production' })).toBe('production');
    });
  });

  it('reads the process environment when the bindings carry no NODE_ENV', () => {
    withNodeEnv('production', () => {
      expect(configuredNodeEnv()).toBe('production');
      expect(configuredNodeEnv({})).toBe('production');
      // Bun passes its server object as c.env.
      expect(configuredNodeEnv({ fetch: () => undefined })).toBe('production');
    });
  });

  it('treats an empty value as unset', () => {
    withNodeEnv('', () => {
      expect(configuredNodeEnv()).toBeUndefined();
    });
    withNodeEnv('staging', () => {
      expect(configuredNodeEnv({ NODE_ENV: '' })).toBe('staging');
    });
  });

  it('ignores a NODE_ENV binding that is not a string', () => {
    withNodeEnv('production', () => {
      expect(configuredNodeEnv({ NODE_ENV: 42 })).toBe('production');
      expect(configuredNodeEnv(null)).toBe('production');
      expect(configuredNodeEnv('development')).toBe('production');
    });
  });
});

describe('runtimeEnv', () => {
  it('defaults to development on Bun and Node', () => {
    expect(isCloudflareWorkers()).toBe(false);
    withNodeEnv(undefined, () => {
      expect(runtimeEnv()).toBe('development');
      expect(runtimeEnv({})).toBe('development');
    });
    withNodeEnv('', () => {
      expect(runtimeEnv()).toBe('development');
    });
  });

  it('defaults to production on Workers', () => {
    asWorkers(() => {
      expect(isCloudflareWorkers()).toBe(true);
      withNodeEnv(undefined, () => {
        expect(runtimeEnv()).toBe('production');
        expect(runtimeEnv({})).toBe('production');
        expect(runtimeEnv({ NODE_ENV: '' })).toBe('production');
      });
    });
  });

  it('uses the NODE_ENV binding on Workers', () => {
    asWorkers(() => {
      withNodeEnv(undefined, () => {
        expect(runtimeEnv({ NODE_ENV: 'development' })).toBe('development');
        expect(runtimeEnv({ NODE_ENV: 'preview' })).toBe('preview');
      });
    });
  });

  it('uses a process environment the Worker was given at run time', () => {
    // nodejs_compat_populate_process_env copies [vars] into process.env.
    asWorkers(() => {
      withNodeEnv('development', () => {
        expect(runtimeEnv({})).toBe('development');
        expect(runtimeEnv({ NODE_ENV: 'production' })).toBe('production');
      });
    });
  });
});

describe('isDevelopmentOrTest', () => {
  it('accepts only development and test', () => {
    expect(isDevelopmentOrTest('development')).toBe(true);
    expect(isDevelopmentOrTest('test')).toBe(true);
    for (const env of ['production', 'preview', 'staging', 'Development', 'dev', '']) {
      expect(isDevelopmentOrTest(env)).toBe(false);
    }
  });
});

/**
 * Bun's bundler replaces `process.env.NODE_ENV` with its build-time value
 * (here forced with `define`, as `bun build --compile` does with the build
 * machine's NODE_ENV). A bundle must still see the NODE_ENV it starts with.
 */
describe('in a bundle', () => {
  let dir: string;
  let bundle: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'inkweld-runtime-env-'));
    const entry = join(dir, 'entry.ts');
    writeFileSync(
      entry,
      `import { configuredNodeEnv, runtimeEnv } from ${JSON.stringify(RUNTIME_ENV_MODULE)};
if (process.argv[2] === 'workers') {
  globalThis.caches = {};
  globalThis.WebSocketPair = class {};
}
console.log(JSON.stringify({
  inlined: process.env.NODE_ENV ?? null,
  configured: configuredNodeEnv() ?? null,
  runtime: runtimeEnv(),
}));
`
    );
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: join(dir, 'out'),
      target: 'bun',
      minify: true,
      define: { 'process.env.NODE_ENV': JSON.stringify('build-time') },
    });
    expect(result.success).toBe(true);
    bundle = result.outputs[0].path;
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(env: Record<string, string>, ...args: string[]): Record<string, unknown> {
    const result = Bun.spawnSync({
      cmd: [process.execPath, bundle, ...args],
      cwd: dir,
      env: { PATH: process.env.PATH ?? '', ...env },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout.toString()) as Record<string, unknown>;
  }

  it('reads NODE_ENV when it starts, not the value it was built with', () => {
    const out = run({ NODE_ENV: 'production' });
    // The bundler did replace the plain read, so the check below means something.
    expect(out.inlined).toBe('build-time');
    expect(out.configured).toBe('production');
    expect(out.runtime).toBe('production');
  });

  it('does not use the build-time value on Bun when NODE_ENV is unset', () => {
    expect(run({})).toMatchObject({ configured: null, runtime: 'development' });
  });

  it('counts as production on Workers whatever value was written into the bundle', () => {
    // Wrangler writes the NODE_ENV of the shell that ran it into the bundle.
    // Only configuredNodeEnv() (log format, e2e switches) falls back to it.
    expect(run({}, 'workers')).toMatchObject({ configured: 'build-time', runtime: 'production' });
  });
});
