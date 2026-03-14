/**
 * Global setup for online e2e tests.
 *
 * This runs before all online tests to verify:
 * 1. Backend server is healthy and accessible
 * 2. Admin user is properly seeded
 * 3. Authentication works correctly
 *
 * This helps diagnose CI failures where the admin user may not exist.
 */

import { request } from '@playwright/test';

import { TEST_API_KEYS, TEST_PASSWORDS } from './common/test-credentials';

const API_BASE_URL = 'http://localhost:9333';

// Must match playwright.online.config.ts env vars
const DEFAULT_ADMIN = {
  username: 'e2e-admin',
  password: TEST_PASSWORDS.ADMIN,
};

export default async function globalSetup(): Promise<void> {
  console.log('\n🔧 Online E2E Global Setup');
  console.log('==========================\n');

  // Create a request context for API calls
  const context = await request.newContext({
    baseURL: API_BASE_URL,
  });

  try {
    // Step 1: Verify backend health
    console.log('1️⃣  Checking backend health...');
    const healthResponse = await context.get('/api/v1/health');
    if (!healthResponse.ok()) {
      throw new Error(
        `Backend health check failed: ${healthResponse.status()} ${await healthResponse.text()}`
      );
    }
    console.log('   ✅ Backend is healthy\n');

    // Step 2: Try to login as admin
    console.log('2️⃣  Verifying admin user exists...');
    const loginResponse = await context.post('/api/v1/auth/login', {
      data: {
        username: DEFAULT_ADMIN.username,
        password: DEFAULT_ADMIN.password,
      },
    });

    if (loginResponse.ok()) {
      console.log(
        `   ✅ Admin user "${DEFAULT_ADMIN.username}" exists and can login\n`
      );

      // Verify admin has admin privileges
      const loginData = (await loginResponse.json()) as {
        token: string;
        user?: { isAdmin?: boolean };
      };
      if (loginData.user?.isAdmin) {
        console.log('   ✅ User has admin privileges\n');
      } else {
        console.log(
          '   ⚠️  User exists but isAdmin flag not confirmed in response\n'
        );
      }

      // Step 3: Test admin API endpoint with the auth token
      console.log('3️⃣  Testing admin API endpoint...');
      const adminResponse = await context.get('/api/v1/users', {
        headers: {
          Authorization: `Bearer ${loginData.token}`,
        },
      });

      if (adminResponse.ok()) {
        console.log('   ✅ Admin API endpoint is accessible\n');

        // Step 4: Set up AI image generation profile for e2e tests
        console.log('4️⃣  Setting up AI image generation for e2e tests...');

        // Set a fake OpenAI API key
        const keyResponse = await context.put(
          '/api/v1/ai/providers/openai/key',
          {
            headers: {
              Authorization: `Bearer ${loginData.token}`,
              'Content-Type': 'application/json',
            },
            data: {
              apiKey: TEST_API_KEYS.FAKE_OPENAI,
            },
          }
        );
        if (keyResponse.ok()) {
          console.log('   ✅ Set fake OpenAI API key\n');
        } else {
          console.log(
            `   ⚠️  Could not set API key: ${keyResponse.status()}\n`
          );
        }

        // Create a test image profile
        const profileResponse = await context.post(
          '/api/v1/admin/image-profiles',
          {
            headers: {
              Authorization: `Bearer ${loginData.token}`,
              'Content-Type': 'application/json',
            },
            data: {
              name: 'E2E-User-Test-OpenAI',
              description: 'Test profile for user e2e tests',
              provider: 'openai',
              modelId: 'gpt-image-1',
              enabled: true,
              supportsImageInput: false,
              supportsCustomResolutions: false,
              supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
              defaultSize: '1024x1024',
              sortOrder: 0,
            },
          }
        );
        if (profileResponse.ok()) {
          console.log('   ✅ Created E2E image profile\n');
        } else if (profileResponse.status() === 409) {
          console.log('   ✅ E2E image profile already exists\n');
        } else {
          console.log(
            `   ⚠️  Could not create profile: ${profileResponse.status()}\n`
          );
        }
      } else {
        const contentType = adminResponse.headers()['content-type'] || '';
        const body = await adminResponse.text();
        console.log(`   ❌ Admin API failed: ${adminResponse.status()}`);
        console.log(`   Content-Type: ${contentType}`);
        console.log(
          `   Response body (first 200 chars): ${body.substring(0, 200)}\n`
        );

        if (body.includes('<!doctype') || body.includes('<!DOCTYPE')) {
          console.log(
            '   🔴 DIAGNOSIS: Admin API is returning HTML instead of JSON!'
          );
          console.log('   This usually means:');
          console.log(
            '   1. The admin endpoint is not found (404 returning HTML fallback)'
          );
          console.log(
            '   2. The backend is returning an error page instead of JSON error'
          );
          console.log('   3. There may be a routing issue in the backend\n');
        }
      }
    } else {
      const errorText = await loginResponse.text();
      console.log(
        `   ❌ Admin login failed: ${loginResponse.status()} ${errorText}\n`
      );

      // Try to register the admin user as a fallback
      console.log('3️⃣  Attempting to create admin user via registration...');
      const registerResponse = await context.post('/api/v1/auth/register', {
        data: {
          username: DEFAULT_ADMIN.username,
          password: DEFAULT_ADMIN.password,
        },
      });

      if (registerResponse.ok()) {
        console.log(
          `   ✅ Registered "${DEFAULT_ADMIN.username}" successfully\n`
        );
        console.log(
          '   ⚠️  Note: User was created via registration, may not have admin privileges\n'
        );
        console.log(
          '   💡 The backend should seed admin via DEFAULT_ADMIN_USERNAME/PASSWORD env vars\n'
        );
      } else {
        const regErrorText = await registerResponse.text();
        console.log(
          `   ❌ Registration also failed: ${registerResponse.status()} ${regErrorText}\n`
        );
        console.log(
          '\n🔴 DIAGNOSIS: The e2e-admin user does not exist and cannot be created.'
        );
        console.log('   This usually means:');
        console.log(
          '   1. The backend was not started with DEFAULT_ADMIN_USERNAME/PASSWORD env vars'
        );
        console.log('   2. Or the database seeding failed silently');
        console.log(
          '\n   Check the backend logs for "Created default admin user" message.\n'
        );

        // Don't throw here - let tests fail naturally with better context
      }
    }

    console.log('🔧 Global setup complete\n');
    console.log('==========================\n');
  } finally {
    await context.dispose();
  }
}
