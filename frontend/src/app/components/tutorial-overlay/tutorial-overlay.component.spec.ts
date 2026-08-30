import { provideZonelessChangeDetection } from '@angular/core';
import { ApplicationRef } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { SettingsService } from '../../services/core/settings.service';
import { TutorialService } from '../../services/core/tutorial.service';
import {
  TUTORIAL_ANCHOR_WAIT_MS,
  TutorialOverlayComponent,
} from './tutorial-overlay.component';

/** Minimal ResizeObserver stand-in — jsdom does not provide one. */
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('TutorialOverlayComponent', () => {
  let fixture: ComponentFixture<TutorialOverlayComponent>;
  let tutorial: TutorialService;
  let stored: Record<string, unknown>;
  let hadResizeObserver = false;
  const anchors: HTMLElement[] = [];

  beforeEach(() => {
    stored = {};
    hadResizeObserver = 'ResizeObserver' in globalThis;
    if (!hadResizeObserver) {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
        FakeResizeObserver;
    }

    TestBed.configureTestingModule({
      imports: [TutorialOverlayComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Short anchor timeout so missing-anchor paths resolve quickly
        { provide: TUTORIAL_ANCHOR_WAIT_MS, useValue: 25 },
        {
          provide: SettingsService,
          useValue: {
            getSetting: vi.fn(
              (key: string, defaultValue: unknown) =>
                stored[key] ?? defaultValue
            ),
            setSetting: vi.fn((key: string, value: unknown) => {
              stored[key] = value;
            }),
          },
        },
      ],
    });

    tutorial = TestBed.inject(TutorialService);
    fixture = TestBed.createComponent(TutorialOverlayComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    tutorial.abort();
    fixture.destroy();
    for (const anchor of anchors) {
      anchor.remove();
    }
    anchors.length = 0;
    if (!hadResizeObserver) {
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    }
    TestBed.resetTestingModule();
  });

  /** Add a visible fake anchor to the document with a fixed bounding rect. */
  function addAnchor(testId: string): HTMLElement {
    const el = document.createElement('button');
    el.dataset['testid'] = testId;
    // jsdom elements have no scrollIntoView
    el.scrollIntoView = vi.fn();
    el.getBoundingClientRect = () => ({
      top: 100,
      left: 400,
      width: 100,
      height: 40,
      right: 500,
      bottom: 140,
      x: 400,
      y: 100,
      toJSON: () => ({}),
    });
    document.body.appendChild(el);
    anchors.push(el);
    return el;
  }

  /**
   * Query by test id in the whole document. The step card lives inside a
   * MatDialog (rendered into the CDK overlay container on document.body),
   * so fixture-scoped queries would miss it.
   */
  function query(testId: string): HTMLElement | null {
    return document.querySelector(`[data-testid="${testId}"]`);
  }

  async function settle(assertion: () => void): Promise<void> {
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        assertion();
      },
      { timeout: 3000 }
    );
  }

  it('renders nothing while no tour is active', () => {
    expect(query('tutorial-overlay')).toBeNull();
    expect(query('tutorial-card')).toBeNull();
  });

  it('shows the card in a platform dialog on the intro step', async () => {
    tutorial.start('home');

    await settle(() => {
      const card = query('tutorial-card');
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain('Welcome to Inkweld!');
      expect(query('tutorial-start-button')).not.toBeNull();
      expect(query('tutorial-not-now-button')).not.toBeNull();
      // No counter on the intro card
      expect(query('tutorial-step-counter')).toBeNull();
    });

    // The card becomes visible once placement has run
    await settle(() =>
      expect(
        query('tutorial-card')?.classList.contains('tutorial-card--ready')
      ).toBe(true)
    );
  });

  it('exposes dialog semantics on the Material dialog container', async () => {
    tutorial.start('home');
    await settle(() => expect(query('tutorial-card')).not.toBeNull());
    // Zoneless: the container's aria bindings refresh on the next app tick
    // after mat-dialog-title registers itself.
    TestBed.inject(ApplicationRef).tick();

    const container = document.querySelector<HTMLElement>(
      '.cdk-overlay-container .mat-mdc-dialog-container'
    );
    expect(container).not.toBeNull();
    expect(container?.getAttribute('role')).toBe('dialog');
    expect(container?.getAttribute('aria-modal')).toBe('true');
    // The step title labels the dialog via mat-dialog-title
    const labelledBy = container?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? '')?.textContent).toContain(
      'Welcome to Inkweld!'
    );
  });

  it('moves focus to the primary button once the card is placed', async () => {
    addAnchor('create-new-project-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());

    query('tutorial-start-button')?.click();

    await settle(() => {
      expect(
        document.activeElement?.matches('[data-testid="tutorial-next-button"]')
      ).toBe(true);
    });
  });

  it('dismisses the tour from the intro card', async () => {
    tutorial.start('home');
    await settle(() => expect(query('tutorial-not-now-button')).not.toBeNull());

    query('tutorial-not-now-button')?.click();

    await settle(() => {
      expect(query('tutorial-overlay')).toBeNull();
    });
    expect(query('tutorial-card')).toBeNull();
    expect(tutorial.isActive()).toBe(false);
    expect(stored['tutorialProgress']).toEqual({ home: 'dismissed' });
  });

  it('dismisses the tour with the close button', async () => {
    tutorial.start('home');
    await settle(() => expect(query('tutorial-close-button')).not.toBeNull());

    query('tutorial-close-button')?.click();

    await settle(() => expect(query('tutorial-overlay')).toBeNull());
    expect(query('tutorial-card')).toBeNull();
    expect(tutorial.isActive()).toBe(false);
  });

  it('dismisses the tour when Escape is pressed', async () => {
    tutorial.start('home');
    await settle(() => expect(query('tutorial-card')).not.toBeNull());

    // The CDK keyboard dispatcher listens for keydown on document.body;
    // Material closes on the legacy keyCode 27.
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        bubbles: true,
      })
    );

    await settle(() => expect(query('tutorial-overlay')).toBeNull());
    expect(query('tutorial-card')).toBeNull();
    expect(tutorial.isActive()).toBe(false);
  });

  it('spotlights the anchor of an anchored step and shows the counter', async () => {
    addAnchor('create-new-project-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());

    query('tutorial-start-button')?.click();

    await settle(() => {
      expect(tutorial.stepIndex()).toBe(1);
      const highlight = query('tutorial-highlight');
      expect(highlight).not.toBeNull();
      // Anchor rect (100,400 100x40) plus 6px spotlight padding
      expect(highlight?.style.top).toBe('94px');
      expect(highlight?.style.left).toBe('394px');
      expect(query('tutorial-step-counter')?.textContent).toContain('1 of 5');
      // Back and next available on interior steps
      expect(query('tutorial-back-button')).not.toBeNull();
      expect(query('tutorial-next-button')).not.toBeNull();
    });
  });

  it('positions the dialog pane beside the anchor', async () => {
    addAnchor('create-new-project-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());

    query('tutorial-start-button')?.click();

    await settle(() => {
      // The pane carries the computed card position (anchor below-right of
      // (400,100): below the anchor, horizontally clamped to the viewport)
      const pane = document.querySelector<HTMLElement>(
        '.cdk-overlay-container .cdk-overlay-pane'
      );
      expect(pane).not.toBeNull();
      const top = parseFloat(pane!.style.marginTop);
      const left = parseFloat(pane!.style.marginLeft);
      expect(top).toBeGreaterThanOrEqual(152); // anchor bottom (140) + gap
      expect(left).toBeGreaterThanOrEqual(12); // viewport margin clamp
    });
  });

  it('skips optional steps whose anchors are missing', async () => {
    addAnchor('create-new-project-button');
    addAnchor('user-menu-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());

    query('tutorial-start-button')?.click();
    await settle(() => expect(tutorial.stepIndex()).toBe(1));

    // Steps 2–4 (projects/sync) have no anchors → tour should land on the
    // user-menu step (index 5).
    query('tutorial-next-button')?.click();
    await settle(() => {
      expect(tutorial.stepIndex()).toBe(5);
      expect(tutorial.currentStep()?.id).toBe('user-menu');
    });
  });

  it('falls back to a centered card when a required anchor is missing', async () => {
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());

    // Step 1 (create button) is required but has no anchor in this test DOM.
    query('tutorial-start-button')?.click();

    await settle(() => {
      expect(tutorial.stepIndex()).toBe(1);
      const card = query('tutorial-card');
      expect(card?.classList.contains('tutorial-card--ready')).toBe(true);
      // No anchor → the pane stays centered (no margin offsets)
      const pane = document.querySelector<HTMLElement>(
        '.cdk-overlay-container .cdk-overlay-pane'
      );
      expect(parseFloat(pane!.style.marginTop)).toBeNaN();
      expect(parseFloat(pane!.style.marginLeft)).toBeNaN();
    });
  });

  it('completes the tour from the last step', async () => {
    addAnchor('create-new-project-button');
    addAnchor('user-menu-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());

    query('tutorial-start-button')?.click();
    await settle(() => expect(tutorial.stepIndex()).toBe(1));

    // Skips the unanchored optional steps → user-menu (last step)
    query('tutorial-next-button')?.click();
    await settle(() => expect(tutorial.currentStep()?.id).toBe('user-menu'));

    await settle(() => expect(query('tutorial-next-button')).not.toBeNull());
    query('tutorial-next-button')?.click();

    await settle(() => {
      expect(query('tutorial-overlay')).toBeNull();
      expect(query('tutorial-card')).toBeNull();
    });
    expect(tutorial.isActive()).toBe(false);
    expect(stored['tutorialProgress']).toEqual({ home: 'completed' });
  });

  it('ignores Escape while no tour is active', () => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(tutorial.isActive()).toBe(false);
    expect(query('tutorial-overlay')).toBeNull();
    expect(query('tutorial-card')).toBeNull();
  });

  it('repositions the spotlight when the window resizes', async () => {
    const anchor = addAnchor('create-new-project-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());
    query('tutorial-start-button')?.click();
    await settle(() =>
      expect(query('tutorial-highlight')?.style.top).toBe('94px')
    );

    // Move the anchor and notify via resize events (dispatched twice so the
    // frame-deduplication path is exercised)
    window.dispatchEvent(new Event('resize'));
    anchor.getBoundingClientRect = () => ({
      top: 300,
      left: 500,
      width: 100,
      height: 40,
      right: 600,
      bottom: 340,
      x: 500,
      y: 300,
      toJSON: () => ({}),
    });
    window.dispatchEvent(new Event('resize'));

    await settle(() => {
      expect(query('tutorial-highlight')?.style.top).toBe('294px');
      expect(query('tutorial-highlight')?.style.left).toBe('494px');
    });
  });

  it('re-resolves the step when the anchor leaves the DOM', async () => {
    const anchor = addAnchor('create-new-project-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());
    query('tutorial-start-button')?.click();
    await settle(() => expect(query('tutorial-highlight')).not.toBeNull());

    // Remove the anchor; the required step falls back to a centered card
    anchor.remove();
    window.dispatchEvent(new Event('resize'));

    await settle(() => {
      expect(query('tutorial-highlight')).toBeNull();
      const pane = document.querySelector<HTMLElement>(
        '.cdk-overlay-container .cdk-overlay-pane'
      );
      // Required-anchor fallback centers the pane (no margin offsets)
      expect(parseFloat(pane!.style.marginTop)).toBeNaN();
    });
    expect(tutorial.stepIndex()).toBe(1);
  });

  it('cleans up pending work when the tour ends mid-measure', async () => {
    addAnchor('create-new-project-button');
    tutorial.start('home');
    await settle(() => expect(query('tutorial-start-button')).not.toBeNull());
    query('tutorial-start-button')?.click();
    await settle(() => expect(query('tutorial-highlight')).not.toBeNull());

    // Schedule a remeasure, then end the tour before its frame can run
    window.dispatchEvent(new Event('resize'));
    tutorial.abort();

    await settle(() => expect(query('tutorial-overlay')).toBeNull());
  });
});
