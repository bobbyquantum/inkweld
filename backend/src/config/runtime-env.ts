/**
 * The environment the server runs in (NODE_ENV), read the same way on every
 * runtime. Code that behaves differently by environment reads it through this
 * module.
 *
 * Bun's bundler replaces `process.env.NODE_ENV` with the value it had at build
 * time, and with --minify `process.env['NODE_ENV']` too, so a compiled binary
 * would keep the build machine's value whatever it is started with. Here the
 * variable is looked up by a name passed in at run time, which a bundler
 * cannot replace.
 *
 * Cloudflare Workers have no process environment (the compatibility date
 * predates `nodejs_compat_populate_process_env`). There NODE_ENV comes from
 * the request's bindings (`[vars]`). Wrangler also writes a value into the
 * bundle in place of `process.env.NODE_ENV`: the NODE_ENV of the shell it ran
 * in, or `production` for `wrangler deploy` and `development` for
 * `wrangler dev`. Only `configuredNodeEnv()` falls back to that value;
 * `runtimeEnv()`, which security-relevant decisions use, never does.
 */

/** Workers expose both `caches` and `WebSocketPair`; Bun and Node do not. */
export function isCloudflareWorkers(): boolean {
  const g = globalThis as Record<string, unknown>;
  return g.caches !== undefined && g.WebSocketPair !== undefined;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A process environment variable, looked up by name when called. */
function processEnvVar(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env?.[name];
}

/** NODE_ENV from the request's bindings (`c.env`), when they carry one. */
function boundNodeEnv(bindings: unknown): string | undefined {
  return bindings !== null && typeof bindings === 'object'
    ? nonEmpty((bindings as { NODE_ENV?: unknown }).NODE_ENV)
    : undefined;
}

/**
 * The NODE_ENV Wrangler wrote into the Worker bundle. Only read on Workers: in
 * a Bun binary this expression holds the build machine's value instead.
 */
function workerBundleNodeEnv(): string | undefined {
  return typeof process === 'undefined' ? undefined : nonEmpty(process.env.NODE_ENV);
}

/**
 * NODE_ENV as configured, or undefined when it is not set. An empty value
 * counts as not set. `bindings` are the request's bindings (`c.env`); on Bun
 * and Node they carry no NODE_ENV, so the process environment is used. On
 * Workers, when neither has it, this is the value Wrangler wrote into the
 * bundle, so use it only where that is wanted: the log format and the switches
 * the Wrangler e2e backend turns off with NODE_ENV=test.
 */
export function configuredNodeEnv(bindings?: unknown): string | undefined {
  return (
    boundNodeEnv(bindings) ??
    nonEmpty(processEnvVar('NODE_ENV')) ??
    (isCloudflareWorkers() ? workerBundleNodeEnv() : undefined)
  );
}

/**
 * The environment the server runs in: NODE_ENV from the request's bindings or
 * the process environment, otherwise `production` on Workers and
 * `development` on Bun and Node. It never uses the value Wrangler wrote into
 * the bundle, so a Worker whose `[vars]` set no NODE_ENV counts as production
 * whatever shell deployed it.
 */
export function runtimeEnv(bindings?: unknown): string {
  const configured = boundNodeEnv(bindings) ?? nonEmpty(processEnvVar('NODE_ENV'));
  return configured ?? (isCloudflareWorkers() ? 'production' : 'development');
}

/** Whether `env` is development or test, the only environments with development defaults. */
export function isDevelopmentOrTest(env: string): boolean {
  return env === 'development' || env === 'test';
}
