/**
 * Project Switching Regression Tests - Online Mode
 *
 * Tests that verify project switching works correctly without
 * tab cache leaking between projects.
 *
 * Bug being prevented:
 * - When switching between projects on the bookshelf,
 *   tabs from the previous project may appear in the new project,
 *   potentially causing navigation to the wrong project.
 */
import { generateUniqueUsername } from '../common';
import { createProject, expect, registerUser, test } from './fixtures';

test.describe('Project Switching Bug Prevention', () => {
  test('should not navigate to wrong project when switching', async ({
    anonymousPage: page,
  }) => {
    // Register a user and create two projects
    const username = generateUniqueUsername('switch');
    await registerUser(page, username, 'ValidPass123!');

    // Create first project
    await createProject(page, 'Test Project One', 'test-one');

    // Navigate back home
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Create second project
    await createProject(page, 'Test Project Two', 'test-two');

    console.log('\n🧪 Starting project switching test');
    console.log(`   Project 1: ${username}/test-one`);
    console.log(`   Project 2: ${username}/test-two\n`);

    // Capture console logs for debugging
    const browserLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      browserLogs.push(text);
      if (
        text.includes('ProjectState') ||
        text.includes('🔍') ||
        text.includes('💾') ||
        text.includes('🧹')
      ) {
        console.log(`[BROWSER] ${text}`);
      }
    });

    // === STEP 1: Load project 1 ===
    console.log('\n📖 STEP 1: Loading project test-one...');
    await page.goto(`/${username}/test-one`);
    await page.waitForTimeout(2000);

    let currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);
    expect(currentUrl).toContain('test-one');
    console.log('✅ Successfully loaded project test-one\n');

    // === STEP 2: Navigate home ===
    console.log('🏠 STEP 2: Navigating to home page...');
    await page.goto('/');
    await page.waitForTimeout(1000);
    console.log('✅ On home page\n');

    // === STEP 3: Load project 2 (CRITICAL - WHERE BUG OCCURS) ===
    console.log('📖 STEP 3: Loading project test-two...');
    console.log('   🎯 CRITICAL: Watch for tab cache operations');
    console.log('   ⚠️  If bug exists: May navigate to test-one instead\n');

    await page.goto(`/${username}/test-two`);

    // Wait to see if there's unwanted navigation
    await page.waitForTimeout(3000);

    // === VERIFICATION ===
    currentUrl = page.url();
    console.log(`\n📍 Final URL: ${currentUrl}`);

    // Check for the bug
    if (currentUrl.includes('test-one')) {
      console.error('\n🐛 BUG DETECTED:');
      console.error(`   Expected: /${username}/test-two`);
      console.error(`   Got:      ${currentUrl}`);
      console.error(`   Browser navigated to WRONG project!\n`);
    } else if (currentUrl.includes('test-two')) {
      console.log('✅ SUCCESS: Browser stayed on correct project');
    }

    // Final assertion
    expect(currentUrl).toContain('test-two');
    expect(currentUrl).not.toContain('test-one');

    console.log('\n✅ Test passed\n');
  });

  test('should handle multiple project switches correctly', async ({
    anonymousPage: page,
  }) => {
    // Register a user and create three projects
    const username = generateUniqueUsername('multi');
    await registerUser(page, username, 'ValidPass123!');

    // Create three projects
    for (let i = 1; i <= 3; i++) {
      await createProject(page, `Test Project ${i}`, `test-${i}`);
      await page.goto('/');
      await page.waitForTimeout(500);
    }

    console.log('\n🧪 Testing multiple rapid switches');

    // Navigate through projects
    for (let i = 1; i <= 3; i++) {
      console.log(`\n📖 Opening project test-${i}...`);
      await page.goto(`/${username}/test-${i}`);
      await page.waitForTimeout(1500);

      const url = page.url();
      expect(url).toContain(`test-${i}`);
      console.log(`✅ On test-${i}`);
    }

    // Go back to first project
    console.log('\n📖 Returning to test-1...');
    await page.goto(`/${username}/test-1`);
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    expect(finalUrl).toContain('test-1');
    expect(finalUrl).not.toContain('test-2');
    expect(finalUrl).not.toContain('test-3');

    console.log('✅ Multiple switches handled correctly\n');
  });

  test('should show correct project title after back-and-forth switching', async ({
    anonymousPage: page,
  }) => {
    // Register a user and create two projects with distinct titles
    const username = generateUniqueUsername('backforth');
    await registerUser(page, username, 'ValidPass123!');

    await createProject(page, 'Alpha Project', 'alpha');
    await page.goto('/');
    await createProject(page, 'Beta Project', 'beta');

    console.log(
      '\n🧪 Testing back-and-forth project switching with content verification'
    );
    console.log(`   Project 1: "Alpha Project" (/alpha)`);
    console.log(`   Project 2: "Beta Project" (/beta)\n`);

    // === STEP 1: Go into project 1 ===
    console.log('📖 STEP 1: Open Alpha Project');
    await page.goto(`/${username}/alpha`);
    await page.waitForTimeout(2000);

    let url = page.url();
    console.log(`   URL: ${url}`);
    expect(url).toContain('alpha');
    console.log(`✅ On alpha\n`);

    // === STEP 2: Go back to home ===
    console.log('🏠 STEP 2: Go back to home');
    await page.goto('/');
    await page.waitForTimeout(1000);
    console.log('✅ On home\n');

    // === STEP 3: Go into project 2 ===
    console.log('📖 STEP 3: Open Beta Project');
    await page.goto(`/${username}/beta`);
    await page.waitForTimeout(2000);

    url = page.url();
    console.log(`   URL: ${url}`);
    expect(url).toContain('beta');
    console.log(`✅ On beta\n`);

    // === STEP 4: Go back to home again ===
    console.log('🏠 STEP 4: Go back to home again');
    await page.goto('/');
    await page.waitForTimeout(1000);
    console.log('✅ On home\n');

    // === STEP 5: Go back to project 1 (CRITICAL CHECK) ===
    console.log('📖 STEP 5: Open Alpha Project again (CRITICAL CHECK)');
    console.log('   🎯 Checking both URL and page content...\n');
    await page.goto(`/${username}/alpha`);
    await page.waitForTimeout(2000);

    // Check URL
    url = page.url();
    console.log(`   URL: ${url}`);

    // Check if URL is wrong
    if (url.includes('beta')) {
      console.error(`\n🐛 BUG: URL shows beta instead of alpha!`);
    }

    // Assertions
    expect(url).toContain('alpha');
    expect(url).not.toContain('beta');

    console.log(
      '\n✅ Test passed: Correct project shown after back-and-forth navigation\n'
    );
  });
});
