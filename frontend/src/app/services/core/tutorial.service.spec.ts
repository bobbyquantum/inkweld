import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type TutorialProgress } from '../../models/tutorial';
import { SettingsService } from './settings.service';
import { TutorialService } from './tutorial.service';
import { TUTORIAL_TOURS } from './tutorial-tours';

const AUTO_START_KEY = 'inkweld-tutorial-autostart';
const PROGRESS_KEY = 'tutorialProgress';

describe('TutorialService', () => {
  let service: TutorialService;
  let stored: Record<string, unknown>;

  beforeEach(() => {
    stored = {};
    localStorage.removeItem(AUTO_START_KEY);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
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

    service = TestBed.inject(TutorialService);
  });

  afterEach(() => {
    localStorage.removeItem(AUTO_START_KEY);
    TestBed.resetTestingModule();
  });

  const progress = (): TutorialProgress => stored[PROGRESS_KEY] ?? {};

  describe('start', () => {
    it('activates the tour at the intro step', () => {
      expect(service.start('home')).toBe(true);

      expect(service.isActive()).toBe(true);
      expect(service.activeTour()?.id).toBe('home');
      expect(service.stepIndex()).toBe(0);
      expect(service.currentStep()?.id).toBe('welcome');
      expect(service.totalSteps()).toBe(TUTORIAL_TOURS['home'].steps.length);
    });

    it('can restart a tour that was already completed', () => {
      service.start('home');
      service.complete();

      expect(service.start('home')).toBe(true);
      expect(service.isActive()).toBe(true);
      expect(service.stepIndex()).toBe(0);
    });
  });

  describe('navigation between steps', () => {
    it('next advances one step', () => {
      service.start('home');
      service.next();

      expect(service.stepIndex()).toBe(1);
    });

    it('next on the last step completes the tour', () => {
      service.start('home');
      const lastIndex = service.totalSteps() - 1;
      for (let i = 0; i < lastIndex; i++) {
        service.next();
      }
      expect(service.stepIndex()).toBe(lastIndex);

      service.next();

      expect(service.isActive()).toBe(false);
      expect(progress()['home']).toBe('completed');
    });

    it('previous goes back one step but not past the intro', () => {
      service.start('home');
      service.next();
      service.previous();
      expect(service.stepIndex()).toBe(0);

      service.previous();
      expect(service.stepIndex()).toBe(0);
      expect(service.isActive()).toBe(true);
    });
  });

  describe('skipUnavailableStep', () => {
    it('skips forward when moving forward', () => {
      service.start('home');
      service.next();

      service.skipUnavailableStep();

      expect(service.stepIndex()).toBe(2);
    });

    it('skips backward when the user was going back', () => {
      service.start('home');
      service.next();
      service.next();
      service.next();
      service.previous(); // now at 2, moving backward

      service.skipUnavailableStep();

      expect(service.stepIndex()).toBe(1);
    });

    it('clamps to the intro when skipping backward past the start', () => {
      service.start('home');
      service.next();
      service.previous(); // back at the intro, direction backward

      service.skipUnavailableStep();

      expect(service.stepIndex()).toBe(0);
      expect(service.isActive()).toBe(true);

      // Direction was reset to forward
      service.skipUnavailableStep();
      expect(service.stepIndex()).toBe(1);
    });

    it('completes the tour when skipping past the final step', () => {
      service.start('home');
      const lastIndex = service.totalSteps() - 1;
      for (let i = 0; i < lastIndex; i++) {
        service.next();
      }

      service.skipUnavailableStep();

      expect(service.isActive()).toBe(false);
      expect(progress()['home']).toBe('completed');
    });
  });

  describe('displayed progress', () => {
    it('excludes skipped steps from the counter', () => {
      service.start('home'); // 6 steps incl. intro
      service.next();
      expect(service.displayedStepNumber()).toBe(1);
      expect(service.displayedTotalSteps()).toBe(5);

      service.next();
      service.skipUnavailableStep(); // step 2 unavailable → 3
      service.skipUnavailableStep(); // step 3 unavailable → 4

      expect(service.stepIndex()).toBe(4);
      expect(service.displayedStepNumber()).toBe(2);
      expect(service.displayedTotalSteps()).toBe(3);
    });

    it('un-counts a formerly skipped step once it is displayed', () => {
      service.start('home');
      service.next();
      service.next();
      service.skipUnavailableStep(); // step 2 marked skipped → index 3
      expect(service.displayedTotalSteps()).toBe(4);

      service.previous(); // revisit step 2, now assumed available
      service.markStepDisplayed();

      expect(service.displayedTotalSteps()).toBe(5);
      expect(service.displayedStepNumber()).toBe(2);
    });

    it('resets skip tracking when a tour restarts', () => {
      service.start('home');
      service.next();
      service.skipUnavailableStep();
      service.dismiss();

      service.start('home');
      expect(service.displayedTotalSteps()).toBe(5);
    });
  });

  describe('closing', () => {
    it('dismiss persists a dismissal and deactivates', () => {
      service.start('home');
      service.dismiss();

      expect(service.isActive()).toBe(false);
      expect(progress()['home']).toBe('dismissed');
      expect(service.shouldOffer('home')).toBe(false);
    });

    it('abort deactivates without persisting anything', () => {
      service.start('home');
      service.abort();

      expect(service.isActive()).toBe(false);
      expect(progress()['home']).toBeUndefined();
      expect(service.shouldOffer('home')).toBe(true);
    });

    it('keeps other tours untouched when one is dismissed', () => {
      service.start('home');
      service.dismiss();

      expect(service.shouldOffer('project')).toBe(true);
    });
  });

  describe('maybeAutoStart', () => {
    it('starts a never-seen tour on desktop', () => {
      expect(service.maybeAutoStart('home', { isMobile: false })).toBe(true);
      expect(service.isActive()).toBe(true);
    });

    it('does not start on mobile', () => {
      expect(service.maybeAutoStart('home', { isMobile: true })).toBe(false);
      expect(service.isActive()).toBe(false);
    });

    it('does not start a tour that was dismissed', () => {
      service.start('home');
      service.dismiss();

      expect(service.maybeAutoStart('home', { isMobile: false })).toBe(false);
    });

    it('does not interrupt an active tour', () => {
      service.start('project');

      expect(service.maybeAutoStart('home', { isMobile: false })).toBe(false);
      expect(service.activeTour()?.id).toBe('project');
    });

    it('respects the global auto-start opt-out', () => {
      localStorage.setItem(AUTO_START_KEY, 'off');

      expect(service.maybeAutoStart('home', { isMobile: false })).toBe(false);
    });
  });

  describe('route changes', () => {
    it('aborts an untouched intro so it can be offered again', async () => {
      service.start('home');

      const router = TestBed.inject(Router);
      await router.navigateByUrl('/somewhere').catch(() => {});

      expect(service.isActive()).toBe(false);
      expect(service.shouldOffer('home')).toBe(true);
    });

    it('dismisses a tour that was in progress', async () => {
      service.start('home');
      service.next();

      const router = TestBed.inject(Router);
      await router.navigateByUrl('/somewhere').catch(() => {});

      expect(service.isActive()).toBe(false);
      expect(progress()['home']).toBe('dismissed');
    });
  });
});
