/**
 * Global setup for Wrangler e2e tests
 *
 * Note: D1 database initialization now happens as part of the webServer command
 * in playwright.wrangler.config.ts, ensuring it runs BEFORE the server starts.
 * This globalSetup only verifies the server is healthy.
 */
import { request } from '@playwright/test';

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:9333';

async function globalSetup(): Promise<void> {
  console.log('\n🔧 Wrangler E2E Global Setup');
  console.log('============================\n');

  // Verify backend health
  console.log('1️⃣  Verifying backend health...');
  const context = await request.newContext({ baseURL: API_BASE_URL });

  try {
    const healthResponse = await context.get('/api/v1/health');
    if (!healthResponse.ok()) {
      console.log(
        `   ⚠️  Backend health check failed: ${healthResponse.status()}`
      );
    } else {
      console.log('   ✅ Backend is healthy\n');
    }

    // Quick check of config endpoint to verify AI is enabled
    console.log('2️⃣  Checking AI configuration...');
    const configResponse = await context.get('/api/v1/config');
    if (configResponse.ok()) {
      const config = (await configResponse.json()) as {
        aiImageGeneration?: boolean;
      };
      if (config.aiImageGeneration) {
        console.log('   ✅ AI image generation is enabled\n');
      } else {
        console.log('   ⚠️  AI image generation is NOT enabled');
        console.log('   This may cause image generation tests to fail\n');
      }
    }
  } finally {
    await context.dispose();
  }

  console.log('🔧 Wrangler setup complete\n');
  console.log('============================\n');
}

export default globalSetup;
