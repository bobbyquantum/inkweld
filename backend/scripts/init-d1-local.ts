#!/usr/bin/env bun
/**
 * Initialize D1 database for local Wrangler e2e testing
 *
 * This script runs Drizzle migrations against the local D1 database
 * used by wrangler dev for e2e testing, then seeds an admin user.
 *
 * Usage:
 *   bun run scripts/init-d1-local.ts
 *   bun run scripts/init-d1-local.ts --persist-path .wrangler/state/e2e-test
 */
import { $ } from 'bun';
import { readdirSync } from 'fs';
import { join } from 'path';
import { hash } from 'bcryptjs';

const args = process.argv.slice(2);
const persistPathArg = args.find((arg) => arg.startsWith('--persist-path='));
const persistPath = persistPathArg?.split('=')[1] || '.wrangler/state/v3/d1';

// Default admin credentials for e2e testing (must match fixtures.ts)
const E2E_ADMIN = {
  username: 'e2e-admin',
  password: 'E2eAdminPassword123!',
  email: 'e2e-admin@localhost',
  name: 'E2E Admin',
};

console.log('🗃️  Initializing local D1 database for e2e testing...');
console.log(`   Persist path: ${persistPath}`);

// Find all SQL migration files in drizzle folder
const drizzleDir = join(import.meta.dir, '..', 'drizzle');
const migrationFiles = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.error('❌ No migration files found in drizzle/');
  process.exit(1);
}

console.log(`📋 Found ${migrationFiles.length} migration files`);

// Run each migration
for (const file of migrationFiles) {
  const filePath = join(drizzleDir, file);
  console.log(`   Running: ${file}`);

  try {
    await $`npx wrangler d1 execute inkweld_local --local --file=${filePath}`.quiet();
    console.log(`   ✅ ${file}`);
  } catch (error) {
    // Check if it's a "table already exists" error (idempotent)
    const errorStr = String(error);
    if (
      errorStr.includes('already exists') ||
      errorStr.includes('duplicate column') ||
      errorStr.includes('SQLITE_ERROR')
    ) {
      console.log(`   ⏭️  ${file} (already applied)`);
    } else if (errorStr.includes("Couldn't find a D1 DB")) {
      console.log(`   ⚠️  Wrangler D1 not configured (CI environment)`);
      console.log(`   Skipping remaining D1 setup - tests will use Bun backend`);
      process.exit(0);
    } else {
      console.error(`   ❌ ${file} failed:`, error);
      // Don't exit - try remaining migrations
    }
  }
}

// Seed admin user for e2e tests
console.log('\n👤 Seeding e2e admin user...');
try {
  const passwordHash = await hash(E2E_ADMIN.password, 10);
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Check if admin already exists
  const checkResult =
    await $`npx wrangler d1 execute inkweld_local --local --command "SELECT id FROM users WHERE username = '${E2E_ADMIN.username}'"`.quiet();
  const checkOutput = checkResult.stdout.toString();

  if (checkOutput.includes('"id"')) {
    // Admin exists, ensure they're admin/approved/enabled
    await $`npx wrangler d1 execute inkweld_local --local --command "UPDATE users SET isAdmin = 1, approved = 1, enabled = 1 WHERE username = '${E2E_ADMIN.username}'"`.quiet();
    console.log(`   ⏭️  Admin user "${E2E_ADMIN.username}" already exists (updated status)`);
  } else {
    // Create new admin - note: column is 'password' not 'passwordHash'
    const insertSql = `INSERT INTO users (id, username, password, email, name, isAdmin, approved, enabled) VALUES ('${userId}', '${E2E_ADMIN.username}', '${passwordHash}', '${E2E_ADMIN.email}', '${E2E_ADMIN.name}', 1, 1, 1)`;
    await $`npx wrangler d1 execute inkweld_local --local --command ${insertSql}`.quiet();
    console.log(`   ✅ Created admin user "${E2E_ADMIN.username}"`);
  }
} catch (error) {
  console.error('   ⚠️  Could not seed admin user:', error);
  console.log('   Tests requiring admin login may fail');
}

// Seed config values for e2e tests (Workers can't read process.env, so we need database values)
console.log('\n⚙️  Seeding config values...');
try {
  const now = Math.floor(Date.now() / 1000);
  // Set USER_APPROVAL_REQUIRED to false for e2e tests
  await $`npx wrangler d1 execute inkweld_local --local --command "INSERT OR REPLACE INTO config (key, value, encrypted, category, description, created_at, updated_at) VALUES ('USER_APPROVAL_REQUIRED', 'false', 0, 'auth', 'Require admin approval for new user registrations', ${now}, ${now})"`.quiet();
  console.log('   ✅ USER_APPROVAL_REQUIRED = false');
} catch (error) {
  console.error('   ⚠️  Could not seed config values:', error);
}

console.log('\n✅ D1 database initialization complete!');
console.log('   Run `npm run e2e:wrangler` to execute tests against wrangler dev');
