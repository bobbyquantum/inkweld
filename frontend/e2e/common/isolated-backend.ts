import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getFreePort } from './free-port';
import { TEST_PASSWORDS, TEST_SESSION_SECRETS } from './test-credentials';

/**
 * A private Bun backend (in-memory database) for one spec file.
 *
 * Use this when a test has to flip an instance-wide setting that would break
 * the specs running in parallel against the shared e2e backend — e.g.
 * REQUIRE_POLICY_ACCEPTANCE, which makes every API registration without an
 * accepted policy fail and puts a blocking dialog in front of every session.
 * The shared frontend dev server is reused; point a browser context at
 * `url` through the app config and it talks only to this backend.
 *
 * Only available where the e2e run can start Bun itself (the `online`
 * config sets E2E_BACKEND_RUNTIME=bun); callers should skip otherwise.
 */
export interface IsolatedBackend {
  url: string;
  admin: { username: string; password: string };
  stop(): Promise<void>;
}

export const canStartIsolatedBackend = (): boolean =>
  process.env['E2E_BACKEND_RUNTIME'] === 'bun';

export async function startIsolatedBackend(
  extraEnv: Record<string, string> = {}
): Promise<IsolatedBackend> {
  const frontendPort = process.env['PLAYWRIGHT_FRONTEND_PORT'];
  if (!frontendPort) {
    throw new Error('PLAYWRIGHT_FRONTEND_PORT is not set');
  }
  const port = await getFreePort();
  const url = `http://localhost:${port}`;
  const dataPath = await mkdtemp(join(tmpdir(), 'inkweld-e2e-isolated-'));
  const admin = { username: 'isolated-admin', password: TEST_PASSWORDS.ADMIN };

  const child: ChildProcess = spawn('bun', ['src/bun-runner.ts'], {
    cwd: resolve(__dirname, '../../../backend'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DB_TYPE: 'sqlite',
      DB_DATABASE: ':memory:',
      SESSION_SECRET: TEST_SESSION_SECRETS.ONLINE,
      ALLOWED_ORIGINS: `http://localhost:${frontendPort}`,
      USER_APPROVAL_REQUIRED: 'false',
      GITHUB_ENABLED: 'false',
      DATA_PATH: dataPath,
      PASSWORD_LOGIN_ENABLED: 'true',
      DEFAULT_ADMIN_USERNAME: admin.username,
      DEFAULT_ADMIN_PASSWORD: admin.password,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (output += d.toString()));

  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      const exited = new Promise(r => child.once('exit', r));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(dataPath, { recursive: true, force: true });
  };

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${url}/api/v1/health`);
      if (res.ok) return { url, admin, stop };
    } catch {
      // not listening yet
    }
    await new Promise(r => setTimeout(r, 250));
  }
  await stop();
  throw new Error(`Isolated backend did not become healthy:\n${output}`);
}
