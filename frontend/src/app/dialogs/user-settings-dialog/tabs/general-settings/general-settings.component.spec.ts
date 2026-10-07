import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TutorialService } from '@services/core/tutorial.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { SettingsService } from '../../../../services/core/settings.service';
import { GeneralSettingsComponent } from './general-settings.component';

describe('GeneralSettingsComponent', () => {
  let fixture: ComponentFixture<GeneralSettingsComponent>;
  let tutorial: TutorialService;
  let stored: Record<string, unknown>;
  const markdownShortcuts = signal(false);

  beforeEach(async () => {
    stored = {};
    markdownShortcuts.set(false);

    await TestBed.configureTestingModule({
      imports: [GeneralSettingsComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: SettingsService,
          useValue: {
            getSetting: (key: string, defaultValue: unknown) =>
              stored[key] ?? defaultValue,
            markdownShortcuts,
            setMarkdownShortcuts: vi.fn((value: boolean) => {
              markdownShortcuts.set(value);
            }),
            setSetting: vi.fn((key: string, value: unknown) => {
              stored[key] = value;
            }),
          },
        },
      ],
    }).compileComponents();

    tutorial = TestBed.inject(TutorialService);
    fixture = TestBed.createComponent(GeneralSettingsComponent);
    await settle();
  });

  /** Render, then let pending async state settle before asserting. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * The rendered "offer guided tours" switch. A slide toggle is a
   * `button[role="switch"]`, not a checkbox input, so its state is read from
   * `aria-checked`.
   */
  function toursToggle(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      '[data-testid="show-tours-toggle"] button[role="switch"]'
    );
  }

  function toursOn(): boolean {
    return toursToggle().getAttribute('aria-checked') === 'true';
  }

  it('shows tours as on by default', () => {
    expect(toursOn()).toBe(true);
  });

  it('turns tours off from the toggle', async () => {
    toursToggle().click();
    await settle();

    expect(tutorial.toursEnabled()).toBe(false);
    expect(stored['tutorialsEnabled']).toBe(false);
  });

  it('reflects an opt-out made from the tour card', async () => {
    tutorial.setToursEnabled(false);
    await settle();

    expect(toursOn()).toBe(false);

    toursToggle().click();
    await settle();

    expect(tutorial.toursEnabled()).toBe(true);
    expect(stored['tutorialsEnabled']).toBe(true);
  });

  describe('Markdown shortcuts', () => {
    function shortcutsSwitch(): HTMLButtonElement {
      return fixture.nativeElement.querySelector(
        '[data-testid="markdown-shortcuts-toggle"] button[role="switch"]'
      );
    }

    it('is off by default', () => {
      expect(shortcutsSwitch().getAttribute('aria-checked')).toBe('false');
    });

    it('turns on from the toggle', async () => {
      shortcutsSwitch().click();
      await settle();

      expect(markdownShortcuts()).toBe(true);
      expect(shortcutsSwitch().getAttribute('aria-checked')).toBe('true');
    });
  });
});
