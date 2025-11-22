import { expect, test } from './fixtures';
import { mockProjects } from './mock-api/projects';

/**
 * E2E test to reproduce the bookshelf project switching bug
 *
 * Bug: When switching between projects on the bookshelf,
 * tabs from the previous project may appear in the new project,
 * potentially causing navigation to the wrong project.
 *
 * Expected behavior:
 * 1. User opens project A
 * 2. User navigates home
 * 3. User opens project B
 * 4. Only project B should load, browser stays on project B URL
 *
 * Actual bug behavior (if present):
 * - Browser navigates to project B but then redirects to project A
 * - URL shows project A when it should show project B
 * - Console logs show tab restoration from wrong project
 */

test.describe('Project Switching Bug', () => {
  test.beforeEach(() => {
    // Reset mock projects before each test
    mockProjects.resetProjects();
  });

  test('should not navigate to wrong project when switching', async ({
    authenticatedPage: page,
  }) => {
    // Setup: Add two test projects
    const project1 = {
      id: 'proj-test123',
      title: 'Test Project 123',
      slug: 'test123',
      description: 'First test project',
      username: 'testuser',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const project2 = {
      id: 'proj-test321',
      title: 'Test Project 321',
      slug: 'test321',
      description: 'Second test project',
      username: 'testuser',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockProjects.addProject(project1);
    mockProjects.addProject(project2);

    console.log('\n🧪 Starting project switching test');
    console.log(`   Project 1: ${project1.username}/${project1.slug}`);
    console.log(`   Project 2: ${project2.username}/${project2.slug}\n`);

    // Capture all console logs from the browser
    const browserLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      browserLogs.push(text);

      // Echo important logs
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
    console.log('\n📖 STEP 1: Loading project test123...');
    await page.goto(`/${project1.username}/${project1.slug}`);
    await page.waitForTimeout(2000);

    let currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);
    expect(currentUrl).toContain(project1.slug);
    console.log('✅ Successfully loaded project test123\n');

    // === STEP 2: Navigate home ===
    console.log('🏠 STEP 2: Navigating to home page...');
    await page.goto('/');
    await page.waitForTimeout(1000);
    console.log('✅ On home page\n');

    // === STEP 3: Load project 2 (CRITICAL - WHERE BUG OCCURS) ===
    console.log('📖 STEP 3: Loading project test321...');
    console.log('   🎯 CRITICAL: Watch for tab cache operations');
    console.log('   ⚠️  If bug exists: May navigate to test123 instead\n');

    await page.goto(`/${project2.username}/${project2.slug}`);

    // Wait to see if there's unwanted navigation
    await page.waitForTimeout(3000);

    // === VERIFICATION ===
    currentUrl = page.url();
    console.log(`\n📍 Final URL: ${currentUrl}`);

    // Check for the bug
    if (currentUrl.includes(project1.slug)) {
      console.error('\n🐛 BUG DETECTED:');
      console.error(`   Expected: /${project2.username}/${project2.slug}`);
      console.error(`   Got:      ${currentUrl}`);
      console.error(`   Browser navigated to WRONG project!\n`);

      // Print relevant logs
      const relevantLogs = browserLogs.filter(
        log =>
          log.includes('🔍 Restoring') ||
          log.includes('💾 Saving') ||
          log.includes('🧹 Clearing') ||
          log.includes('cache key')
      );

      if (relevantLogs.length > 0) {
        console.error('📋 Cache operations that may show the bug:');
        relevantLogs.forEach(log => console.error(`   ${log}`));
      }
    } else if (currentUrl.includes(project2.slug)) {
      console.log('✅ SUCCESS: Browser stayed on correct project');
    }

    // Print cache-related logs for debugging
    const cacheOps = browserLogs.filter(
      log =>
        log.includes('cache key') ||
        log.includes('Restoring tabs') ||
        log.includes('Saving')
    );

    if (cacheOps.length > 0) {
      console.log('\n📋 Cache operations log:');
      cacheOps.slice(0, 10).forEach(log => console.log(`   ${log}`));
      if (cacheOps.length > 10) {
        console.log(`   ... and ${cacheOps.length - 10} more`);
      }
    }

    // Final assertion
    expect(currentUrl).toContain(project2.slug);
    expect(currentUrl).not.toContain(project1.slug);

    console.log('\n✅ Test passed\n');
  });

  test('should handle multiple project switches correctly', async ({
    authenticatedPage: page,
  }) => {
    // Add three projects
    for (let i = 1; i <= 3; i++) {
      mockProjects.addProject({
        id: `proj-test${i}`,
        title: `Test Project ${i}`,
        slug: `test${i}`,
        description: `Test project ${i}`,
        username: 'testuser',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    console.log('\n🧪 Testing multiple rapid switches');

    // Navigate through projects
    for (let i = 1; i <= 3; i++) {
      console.log(`\n📖 Opening project test${i}...`);
      await page.goto(`/testuser/test${i}`);
      await page.waitForTimeout(1500);

      const url = page.url();
      expect(url).toContain(`test${i}`);
      console.log(`✅ On test${i}`);
    }

    // Go back to first project
    console.log('\n📖 Returning to test1...');
    await page.goto('/testuser/test1');
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    expect(finalUrl).toContain('test1');
    expect(finalUrl).not.toContain('test2');
    expect(finalUrl).not.toContain('test3');

    console.log('✅ Multiple switches handled correctly\n');
  });

  test('should show correct project title after back-and-forth switching', async ({
    authenticatedPage: page,
  }) => {
    // Setup: Two projects with very different titles
    const project1 = {
      id: 'proj-alpha',
      title: 'Alpha Project',
      slug: 'alpha',
      description: 'First project',
      username: 'testuser',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const project2 = {
      id: 'proj-beta',
      title: 'Beta Project',
      slug: 'beta',
      description: 'Second project',
      username: 'testuser',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockProjects.addProject(project1);
    mockProjects.addProject(project2);

    console.log(
      '\n🧪 Testing back-and-forth project switching with content verification'
    );
    console.log(`   Project 1: "${project1.title}" (/${project1.slug})`);
    console.log(`   Project 2: "${project2.title}" (/${project2.slug})\n`);

    // === STEP 1: Go into project 1 ===
    console.log('📖 STEP 1: Open Alpha Project');
    await page.goto(`/${project1.username}/${project1.slug}`);
    await page.waitForTimeout(2000);

    let url = page.url();
    console.log(`   URL: ${url}`);
    expect(url).toContain(project1.slug);
    console.log(`✅ On ${project1.slug}\n`);

    // === STEP 2: Go back to home ===
    console.log('🏠 STEP 2: Go back to home');
    await page.goto('/');
    await page.waitForTimeout(1000);
    console.log('✅ On home\n');

    // === STEP 3: Go into project 2 ===
    console.log('📖 STEP 3: Open Beta Project');
    await page.goto(`/${project2.username}/${project2.slug}`);
    await page.waitForTimeout(2000);

    url = page.url();
    console.log(`   URL: ${url}`);
    expect(url).toContain(project2.slug);
    console.log(`✅ On ${project2.slug}\n`);

    // === STEP 4: Go back to home again ===
    console.log('🏠 STEP 4: Go back to home again');
    await page.goto('/');
    await page.waitForTimeout(1000);
    console.log('✅ On home\n');

    // === STEP 5: Go back to project 1 (CRITICAL CHECK) ===
    console.log('📖 STEP 5: Open Alpha Project again (CRITICAL CHECK)');
    console.log('   🎯 Checking both URL and page content...\n');
    await page.goto(`/${project1.username}/${project1.slug}`);
    await page.waitForTimeout(2000);

    // Check URL
    url = page.url();
    console.log(`   URL: ${url}`);

    // Check if URL is wrong
    if (url.includes(project2.slug)) {
      console.error(
        `\n🐛 BUG: URL shows ${project2.slug} instead of ${project1.slug}!`
      );
    }

    // Check page title/content - look for project name in the page
    const pageContent = await page.textContent('body');

    console.log(`\n📋 Checking page content for project titles...`);
    const hasProject1Title = pageContent?.includes(project1.title);
    const hasProject2Title = pageContent?.includes(project2.title);

    console.log(`   Contains "${project1.title}": ${hasProject1Title}`);
    console.log(`   Contains "${project2.title}": ${hasProject2Title}`);

    if (!hasProject1Title && hasProject2Title) {
      console.error(
        `\n🐛 BUG DETECTED: Page shows "${project2.title}" content when it should show "${project1.title}"!`
      );
      console.error(`   URL: ${url}`);
      console.error(`   Expected project: ${project1.slug}`);
      console.error(`   Content from: ${project2.slug}`);
    }

    // Assertions
    expect(url).toContain(project1.slug);
    expect(url).not.toContain(project2.slug);

    // If we can find project titles in the page, verify the right one is shown
    if (hasProject1Title || hasProject2Title) {
      expect(hasProject1Title).toBe(true);
      expect(hasProject2Title).toBe(false);
    }

    console.log(
      '\n✅ Test passed: Correct project shown after back-and-forth navigation\n'
    );
  });
});
