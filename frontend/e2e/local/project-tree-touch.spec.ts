/**
 * Project Tree Touch Gestures - Local Mode
 *
 * On a touch screen, a tree row gets `touchend` at the end of every touch
 * that starts on it: taps, but also scroll swipes and drags. Only a tap may
 * toggle a folder or open an element. A swipe or drag that started on an
 * open folder used to collapse it on release, which moved every row below it
 * and lost the user's place in the tree, and dragging a document opened it.
 *
 * The gestures are sent as raw touch points over CDP (Chromium only), so the
 * browser scrolls and the CDK starts its long-press drag just as it would
 * under a finger. Playwright's own touchscreen can only tap.
 */
import { type CDPSession, type Locator, type Page } from '@playwright/test';

import {
  createProjectWithTwoSteps,
  expandTreeFolder,
} from '../common/test-helpers';
import { expect, test } from './fixtures';

/** Longer than the tree's 300 ms touch drag delay. */
const DRAG_HOLD_MS = 350;

type Point = { x: number; y: number };

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

async function centreOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Waits until the tree stops scrolling, since a swipe can leave a fling
 * running, and returns where it stopped.
 */
async function settledScrollTop(tree: Locator): Promise<number> {
  let previous = Number.NaN;
  await expect
    .poll(
      async () => {
        const current = await tree.evaluate(el => el.scrollTop);
        const settled = current === previous;
        previous = current;
        return settled;
      },
      { intervals: [100] }
    )
    .toBe(true);
  return previous;
}

/** Scrolls the tree to the top, so the rows used below are on screen. */
async function scrollTreeToTop(tree: Locator): Promise<void> {
  await settledScrollTop(tree);
  await tree.evaluate(el => el.scrollTo({ top: 0 }));
  await expect.poll(() => tree.evaluate(el => el.scrollTop)).toBe(0);
}

/**
 * Waits for two animation frames, by which time Angular has rendered
 * whatever the last gesture changed, so a test can check that it changed
 * nothing.
 */
async function afterRender(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
}

/** One finger on the screen, driven through CDP. */
class Finger {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession
  ) {}

  static async on(page: Page): Promise<Finger> {
    return new Finger(page, await page.context().newCDPSession(page));
  }

  /** A quick swipe from `from` to `to`, the way a list is scrolled. */
  async swipe(from: Point, to: Point): Promise<void> {
    await this.send('touchStart', [from]);
    await this.slide(from, to);
    await this.send('touchEnd', []);
  }

  /**
   * A long press then a slide: the CDK only starts a touch drag once the
   * finger has been still for its delay. Nothing on the page changes while
   * the finger is held, so there is no condition to wait for but time.
   */
  async drag(from: Point, to: Point): Promise<void> {
    await this.send('touchStart', [from]);
    await this.page.waitForTimeout(DRAG_HOLD_MS);
    await this.slide(from, to);
    await expect(this.page.locator('.cdk-drag-preview')).toBeAttached();
    await this.send('touchEnd', []);
    await expect(this.page.locator('.cdk-drag-preview')).toHaveCount(0);
  }

  /**
   * Moves to `to` in small steps, each its own touchmove. Chromium only
   * reports moves once the finger leaves a slop region of about 15 px.
   */
  private async slide(from: Point, to: Point, steps = 10): Promise<void> {
    for (let i = 1; i <= steps; i++) {
      await this.send('touchMove', [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ]);
    }
  }

  private async send(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: Point[]
  ): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
}

/** Cancels the Move Item dialog that a drop opens. */
async function cancelMoveDialog(page: Page): Promise<void> {
  const cancel = page.getByTestId('move-dialog-cancel');
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(cancel).toBeHidden();
}

test.describe('Project tree touch gestures', () => {
  test('swipes and drags leave folders as they were; taps toggle them', async ({
    localPage: page,
  }) => {
    await page.getByTestId('empty-state').waitFor({ state: 'visible' });
    await createProjectWithTwoSteps(
      page,
      'Touch Tree',
      'touch-tree',
      undefined,
      'worldbuilding-demo'
    );
    const projectUrl = page.url();

    // At phone width the tree sits in a drawer behind the menu button.
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    const tree = page.getByTestId('project-tree-scroll');
    await expect(tree).toBeVisible();
    // Open enough folders that the tree is taller than the screen.
    for (const name of ['Characters', 'Locations', 'Magic & Lore']) {
      await expandTreeFolder(page, name);
    }

    const finger = await Finger.on(page);
    const characters = page.getByTestId('element-Characters');
    const locations = page.getByTestId('element-Locations');

    await test.step('a swipe that starts on an open folder scrolls past it', async () => {
      await scrollTreeToTop(tree);
      const start = await centreOf(characters);
      await finger.swipe(start, { x: start.x, y: start.y - 300 });

      expect(await settledScrollTop(tree)).toBeGreaterThan(0);
      await afterRender(page);
      expect(await characters.getAttribute('aria-expanded')).toBe('true');
    });

    // The suite runs with reduced motion, which gives every element a short
    // transition, so the CDK animates each drop and ends the drag after the
    // row's touchend. Without that preference, as for most people, the drop
    // doesn't animate and the drag ends first. Drag the way most people do.
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await test.step('dragging an open folder leaves it open', async () => {
      await scrollTreeToTop(tree);
      const start = await centreOf(locations);
      await finger.drag(start, { x: start.x, y: start.y - 50 });
      await cancelMoveDialog(page);

      expect(await locations.getAttribute('aria-expanded')).toBe('true');
    });

    await test.step('dragging a document does not open it', async () => {
      await scrollTreeToTop(tree);
      const start = await centreOf(
        page.getByTestId('element-Elara Nightwhisper')
      );
      await finger.drag(start, { x: start.x, y: start.y + 50 });
      await cancelMoveDialog(page);

      expect(page.url()).toBe(projectUrl);
      await expect(tree).toBeVisible();
    });

    await test.step('a tap still toggles a folder', async () => {
      await scrollTreeToTop(tree);
      await characters.tap();
      await expect(characters).toHaveAttribute('aria-expanded', 'false');
      await characters.tap();
      await expect(characters).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
