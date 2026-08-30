import {
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { SettingsService } from '../../services/core/settings.service';
import { TutorialService } from '../../services/core/tutorial.service';
import {
  TutorialCardDialogComponent,
  type TutorialCardDialogData,
} from './tutorial-card-dialog.component';

/** Fixed anchor rect used by the placement tests. */
function anchorRect(): DOMRect {
  return {
    top: 100,
    left: 400,
    width: 100,
    height: 40,
    right: 500,
    bottom: 140,
    x: 400,
    y: 100,
    toJSON: () => ({}),
  };
}

describe('TutorialCardDialogComponent', () => {
  let fixture: ComponentFixture<TutorialCardDialogComponent>;
  let tutorial: TutorialService;
  let anchorRectSignal: WritableSignal<DOMRect | null>;
  let updatePosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    anchorRectSignal = signal<DOMRect | null>(null);

    TestBed.configureTestingModule({
      imports: [TutorialCardDialogComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: SettingsService,
          useValue: {
            getSetting: (_key: string, defaultValue: unknown) => defaultValue,
            setSetting: vi.fn(),
          },
        },
        {
          provide: MatDialogRef,
          useValue: { updatePosition: (updatePosition = vi.fn()) },
        },
        {
          provide: MAT_DIALOG_DATA,
          useFactory: (): TutorialCardDialogData => ({
            anchorRect: anchorRectSignal,
          }),
        },
      ],
    });

    tutorial = TestBed.inject(TutorialService);
    tutorial.start('home');
    fixture = TestBed.createComponent(TutorialCardDialogComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    tutorial.abort();
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  /** Wait for the placement rAF chain to finish. */
  async function settle(assertion: () => void): Promise<void> {
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        assertion();
      },
      { timeout: 3000 }
    );
  }

  it('renders the intro card with start and dismiss actions', () => {
    const card = fixture.nativeElement.querySelector(
      '[data-testid="tutorial-card"]'
    );
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Welcome to Inkweld!');
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="tutorial-start-button"]'
      )
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="tutorial-not-now-button"]'
      )
    ).not.toBeNull();
    // The intro card shows no step counter
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="tutorial-step-counter"]'
      )
    ).toBeNull();
  });

  it('labels the dialog with the step title via mat-dialog-title', () => {
    const title = fixture.nativeElement.querySelector('h2[mat-dialog-title]');
    expect(title).not.toBeNull();
    expect(title.textContent).toContain('Welcome to Inkweld!');
    expect(title.id).toBeTruthy();
  });

  it('centers the pane for anchor-less steps', async () => {
    await settle(() => expect(updatePosition).toHaveBeenCalledWith());
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="tutorial-card"]')
        ?.classList.contains('tutorial-card--ready')
    ).toBe(true);
  });

  it('positions the pane below a fitting anchor', async () => {
    anchorRectSignal.set(anchorRect());

    await settle(() => {
      const [position] = updatePosition.mock.calls.at(-1) ?? [];
      // jsdom has no layout: the card measures 0×0, so the pane goes right
      // below the anchor, horizontally centered on it (no clamping needed).
      expect(position).toEqual({ top: '152px', left: '450px' });
    });
  });

  it('re-places the pane when the anchor rect changes', async () => {
    anchorRectSignal.set(anchorRect());
    await settle(() => expect(updatePosition).toHaveBeenCalled());
    updatePosition.mockClear();

    anchorRectSignal.set({ ...anchorRect(), top: 400, bottom: 440 });

    await settle(() => {
      const [position] = updatePosition.mock.calls.at(-1) ?? [];
      expect(position).toEqual({ top: '452px', left: '450px' });
    });
  });
});
