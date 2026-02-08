import { defineConfig } from '@playwright/test';
import dockerConfig from './playwright.docker.config';
import onlineConfig from './playwright.online.config';
import localConfig from './playwright.local.config';
import wranglerConfig from './playwright.wrangler.config';
import screenshotsConfig from './playwright.screenshots.config';
import mcpConfig from './playwright.mcp.config';

const configMap = {
  docker: dockerConfig,
  online: onlineConfig,
  local: localConfig,
  wrangler: wranglerConfig,
  screenshots: screenshotsConfig,
  mcp: mcpConfig,
};

const configType = process.env.TEST_ENV || 'online';
const selectedConfig = configMap[configType as keyof typeof configMap];

if (!selectedConfig) {
  throw new Error(`Unknown TEST_ENV: ${configType}`);
}

export default selectedConfig;