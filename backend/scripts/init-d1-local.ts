#!/usr/bin/env bun
/**
 * Initialize D1 database for local Wrangler e2e testing
 *
 * This script runs Drizzle migrations against the local D1 database
 * used by wrangler dev for e2e testing.
 *
 * Usage:
 *   bun run scripts/init-d1-local.ts
 *   bun run scripts/init-d1-local.ts --persist-path .wrangler/state/e2e-test
 */
import { $ } from 'bun';
import { readdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const persistPathArg = args.find((arg) => arg.startsWith('--persist-path='));
const persistPath = persistPathArg?.split('=')[1] || '.wrangler/state/v3/d1';

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
    if (errorStr.includes('already exists')) {
      console.log(`   ⏭️  ${file} (already applied)`);
    } else {
      console.error(`   ❌ ${file} failed:`, error);
      // Don't exit - try remaining migrations
    }
  }
}

console.log('\n✅ D1 database initialization complete!');
console.log('   Run `npm run e2e:wrangler` to execute tests against wrangler dev');
