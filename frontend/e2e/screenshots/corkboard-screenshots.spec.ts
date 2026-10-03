/**
 * Corkboard, Outline & Folder Publishing Screenshot Tests
 *
 * Builds a small manuscript in local mode (a part folder holding a chapter
 * folder, scenes with synopses, statuses and word targets, and a research
 * note), then captures the folder's corkboard and outline views and a
 * publish plan filled by "Add everything" — in light and dark mode from a
 * single setup.
 */

import { type Page } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { dismissToastIfPresent } from '../common/test-helpers';
import { expect, test } from './fixtures';
import { captureElementScreenshot } from './screenshot-helpers';
import { applyColorScheme, type ColorScheme } from './theme-helpers';

const SCREENSHOTS_DIR = join(
  process.cwd(),
  '..',
  'docs',
  'site',
  'static',
  'img',
  'generated'
);

const PART = 'Part One';
const CHAPTER = 'Chapter 1';

interface SceneSpec {
  name: string;
  parent: string;
  prose: string;
  synopsis: string;
  status: 'idea' | 'draft' | 'revised' | 'final';
  target: number;
}

// Listed in creation order. A new element is inserted at the top of its
// folder, so this is the reverse of reading order within each folder.
const SCENES: SceneSpec[] = [
  {
    name: 'The Lamp Room',
    parent: CHAPTER,
    prose: 'Ada trimmed the wick by feel.',
    synopsis: 'Night falls; the lamp fails and Ada climbs the tower alone.',
    status: 'idea',
    target: 1200,
  },
  {
    name: 'Arrival',
    parent: CHAPTER,
    prose:
      'The supply boat came in low and late, its hull slapping against the swell as Tom threw the line.',
    synopsis: 'Tom arrives with supplies and a letter he will not explain.',
    status: 'draft',
    target: 2000,
  },
  {
    name: 'Storm Warning',
    parent: PART,
    prose:
      'The barometer had been falling since dawn, and by noon the gulls had gone inland.',
    synopsis: 'Ada reads the signs before anyone else and sends word ashore.',
    status: 'revised',
    target: 1500,
  },
];

async function createInside(
  page: Page,
  parent: string,
  type: 'folder' | 'item' | 'item-note',
  name: string
): Promise<void> {
  await page.getByTestId(`element-${parent}`).click({ button: 'right' });
  await page.getByTestId('context-menu-new-element').click();
  await page.getByTestId(`element-type-${type}`).click();
  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

async function setupManuscript(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  await page.getByTestId('create-first-project-button').click();
  await page.getByTestId('next-button').click();
  await page.getByTestId('project-title-input').fill('The Lighthouse');
  await page.getByTestId('project-slug-input').fill('the-lighthouse');
  await page.getByTestId('create-project-button').click();
  await page.waitForURL(/the-lighthouse/);
  await dismissToastIfPresent(page);

  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-folder').click();
  await page.getByTestId('element-name-input').fill(PART);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${PART}`)).toBeVisible();

  await createInside(page, PART, 'item-note', 'Research: tides');
  await createInside(page, PART, 'folder', CHAPTER);

  for (const scene of SCENES) {
    await createInside(page, scene.parent, 'item', scene.name);
    const editor = page.locator('ngx-editor .ProseMirror');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type(scene.prose);
    await expect(editor).toContainText(scene.prose);
  }

  // Open the part folder on the corkboard and fill in the cards.
  await page.getByTestId(`element-${PART}`).click({ button: 'right' });
  await page.getByTestId('context-menu-open-folder').click();
  await expect(page.getByTestId('scene-corkboard')).toBeVisible();

  const chapterCard = page
    .locator('[data-testid^="corkboard-card-"]')
    .filter({ hasText: CHAPTER });
  const chapterSynopsis = chapterCard.locator('textarea');
  await chapterSynopsis.fill(
    'The supply boat brings Tom, a letter, and the first of the weather.'
  );
  await chapterSynopsis.blur();

  // Every scene's details are set from the outline, which lists them all.
  await page.getByTestId('folder-view-outline').click();
  for (const scene of SCENES) {
    const row = page
      .locator('[data-testid^="outline-row-"]')
      .filter({ hasText: scene.name });
    await row.locator('[data-testid^="outline-details-"]').click();
    await page.getByTestId('scene-details-status').click();
    await page
      .getByRole('option', { name: new RegExp(scene.status, 'i') })
      .click();
    await page.getByTestId('scene-details-synopsis').fill(scene.synopsis);
    await page
      .getByTestId('scene-details-word-target')
      .fill(String(scene.target));
    await page.getByTestId('scene-details-save').click();
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    await expect(row.locator('input.synopsis')).toHaveValue(scene.synopsis);
  }
  await expect(page.getByTestId('outline-totals')).toContainText('3 scenes');
}

/** Move the pointer away and wait for any tooltip to disappear. */
async function clearHover(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await expect(page.locator('.mat-mdc-tooltip')).toHaveCount(0);
}

async function captureViews(page: Page, scheme: ColorScheme): Promise<void> {
  await applyColorScheme(page, scheme);

  await page.getByTestId('folder-view-corkboard').click();
  const corkboard = page.getByTestId('scene-corkboard');
  await expect(corkboard).toBeVisible();
  await expect(corkboard).not.toContainText('…');
  await clearHover(page);
  await captureElementScreenshot(
    page,
    [page.locator('.folder-editor-header'), corkboard],
    join(SCREENSHOTS_DIR, `corkboard-overview-${scheme}.png`),
    16
  );

  await page.getByTestId('folder-view-outline').click();
  const outline = page.getByTestId('scene-outline');
  await expect(outline).toBeVisible();
  await expect(outline).not.toContainText('…');
  await clearHover(page);
  await captureElementScreenshot(
    page,
    [page.locator('.folder-editor-header'), outline],
    join(SCREENSHOTS_DIR, `outline-overview-${scheme}.png`),
    16
  );
}

async function capturePublishPlan(
  page: Page,
  scheme: ColorScheme
): Promise<void> {
  await applyColorScheme(page, scheme);
  const list = page.getByTestId('content-items-list');
  await expect(list).not.toContainText('…');
  await clearHover(page);
  await captureElementScreenshot(
    page,
    [list],
    join(SCREENSHOTS_DIR, `publish-plan-folders-${scheme}.png`),
    4
  );
}

test.describe('Corkboard & Outline Screenshots', () => {
  test.beforeAll(async () => {
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('corkboard, outline and folder publish plan — light + dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupManuscript(page);

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(`folder views — ${scheme}`, async () => {
        await captureViews(page, scheme);
      });
    }

    await test.step('publish plan from Add everything', async () => {
      const [user, slug] = new URL(page.url()).pathname
        .split('/')
        .filter(Boolean);
      await page.goto(`/${user}/${slug}/publish-plans`);
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();
      await page.getByTestId('nav-contents').click();
      await page.getByTestId('add-everything-button').click();
      await expect(
        page.getByTestId('content-item-0').getByTestId('item-name')
      ).toContainText(PART);
    });

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(`publish plan — ${scheme}`, async () => {
        await capturePublishPlan(page, scheme);
      });
    }
  });
});
