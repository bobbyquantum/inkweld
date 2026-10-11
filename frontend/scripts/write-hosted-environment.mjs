#!/usr/bin/env node
/**
 * Write the Angular environment file for a hosted Cloudflare deployment
 * (preview or production), used by `.github/workflows/deploy-cloudflare-reusable.yml`.
 *
 * Usage: node scripts/write-hosted-environment.mjs <output-file>
 *
 * Reads from the process environment:
 *   ADVERTISE_SERVER "true" (default) bakes API_URL / WSS_URL into the build so
 *                    the app offers that server. "false" builds a
 *                    frontend-only app: no server URL at all, and the setup
 *                    screen's server field starts empty (`frontendOnly`), so a
 *                    private backend is never suggested to visitors.
 *   API_URL          hosted backend URL, e.g. https://api.example.com
 *                    (required unless ADVERTISE_SERVER=false)
 *   WSS_URL          hosted WebSocket URL, e.g. wss://api.example.com
 *                    (required unless ADVERTISE_SERVER=false)
 *   AUTO_CONFIGURE   "true" connects first-time visitors to the hosted server;
 *                    "false" shows the setup screen (Browser / Cloud Sync /
 *                    Server) with the hosted URL pre-filled, if any.
 *   DROPBOX_APP_KEY  public Dropbox OAuth app key; empty hides the provider.
 *
 * The app version comes from the root package.json so a version bump reaches
 * the hosted builds without editing the workflow.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputFile = process.argv[2];
if (!outputFile) {
  console.error('Usage: write-hosted-environment.mjs <output-file>');
  process.exit(1);
}

const advertiseServer = process.env.ADVERTISE_SERVER ?? 'true';
if (advertiseServer !== 'true' && advertiseServer !== 'false') {
  console.error('ADVERTISE_SERVER must be "true" or "false".');
  process.exit(1);
}
const frontendOnly = advertiseServer === 'false';

const autoConfigure = process.env.AUTO_CONFIGURE;
if (autoConfigure !== 'true' && autoConfigure !== 'false') {
  console.error('AUTO_CONFIGURE must be "true" or "false".');
  process.exit(1);
}
if (frontendOnly && autoConfigure === 'true') {
  console.error(
    'AUTO_CONFIGURE=true needs a server: set ADVERTISE_SERVER=true.'
  );
  process.exit(1);
}

const apiUrl = frontendOnly ? '' : (process.env.API_URL ?? '');
const wssUrl = frontendOnly ? '' : (process.env.WSS_URL ?? '');
if (!frontendOnly && (!apiUrl || !wssUrl)) {
  console.error('API_URL and WSS_URL must both be set.');
  process.exit(1);
}

const rootPackageJson = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../package.json'
);
const { version } = JSON.parse(readFileSync(rootPackageJson, 'utf8'));

const environment = {
  production: true,
  version,
  apiUrl,
  wssUrl,
  autoConfigure: autoConfigure === 'true',
  frontendOnly,
  cloudSync: {
    dropbox: { appKey: process.env.DROPBOX_APP_KEY ?? '' },
  },
};

writeFileSync(
  outputFile,
  `export const environment = ${JSON.stringify(environment, null, 2)};\n`
);
console.log(
  `Wrote ${outputFile} (version ${version}, autoConfigure ${autoConfigure}, frontendOnly ${frontendOnly})`
);
