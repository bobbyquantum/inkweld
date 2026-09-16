import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type TutorialProgress } from '../../models/tutorial';
import { SettingsService } from './settings.service';
import { TutorialService } from './tutorial.service';
import { TUTORIAL_ANCHOR_PRESENT } from './tutorial-anchors';

const AUTO_START_KEY = 'inkweld-tutorial-autostart';
const PROGRESS_KEY = 'tutorialProgress';
const TOURS_ENABLED_KEY = 'tutorialsEnabled';

/** The optional anchors of the home tour, in step order. */
const HOME_OPTIONAL_ANCHORS = ['empty-state', 'covers-grid', 'sync-all-btn'];

describe('TutorialService', () => {
  let service: TutorialService;
  let stored: Record<string, unknown>;
  /** Anchors the tests pretend are on screen when a run is planned. */
  let onScreen: Set<string>;

  /**
   * Build a service over the current `stored` contents — a second call stands
   * in for a fresh session reading back what was persisted.
   */
  function freshService(): TutorialService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: TUTORIAL_ANCHOR_PRESENT,
          useValue: (testIds: readonly string[]) =>
            testIds.some(testId => onScreen.has(testId)),
        },
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
    return TestBed.inject(TutorialService);
  }

  beforeEach(() => {
    stored = {};
    onScreen = new Set(HOME_OPTIONAL_ANCHORS);
    localStorage.removeItem(AUTO_START_KEY);

    service = freshService();
  });

  afterEach(() => {
    localStorage.removeItem(AUTO_START_KEY);
    TestBed.resetTestingModule();
  });

  const progress = (): TutorialProgress => stored[PROGRESS_KEY] ?? {};

  /** Walk the whole tour, collecting the id of every step actually shown. */
  function visitAll(): string[] {
    const visited: string[] = [];
    while (service.isActive()) {
      visited.push(service.currentStep()?.id ?? '');
      service.next();
    }
    return visited;
  }

  describe('start', () => {
    it('activates the tour at the intro step', () => {
      expect(service.start('home')).toBe(true);

      expect(service.isActive()).toBe(true);
      expect(service.activeTour()?.id).toBe('home');
      expect(service.stepIndex()).toBe(0);
      expect(service.currentStep()?.id).toBe('welcome');
      expect(service.isLastStep()).toBe(false);
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
      while (!service.isLastStep()) {
        service.next();
      }

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

  describe('planning which steps a run shows', () => {
    it('leaves out optional steps whose anchors are off screen', () => {
      onScreen.clear();
      service.start('home');
      service.next();

      expect(visitAll()).toEqual(['create', 'user-menu']);
      expect(progress()['home']).toBe('completed');
    });

    it('keeps the counter fixed for the whole run', () => {
      onScreen = new Set(['covers-grid']);
      service.start('home');
      service.next();

      const counters: string[] = [];
      while (service.isActive()) {
        counters.push(
          `${service.displayedStepNumber()} of ${service.displayedTotalSteps()}`
        );
        service.next();
      }

      expect(counters).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    });

    it('counts every step when all the anchors are on screen', () => {
      service.start('home');
      service.next();

      expect(service.displayedStepNumber()).toBe(1);
      expect(service.displayedTotalSteps()).toBe(5);
      expect(visitAll()).toEqual([
        'create',
        'projects-empty',
        'projects-grid',
        'sync',
        'user-menu',
      ]);
    });

    it('re-plans on the way out of the intro, so late anchors still count', () => {
      onScreen.clear();
      service.start('home');
      expect(service.displayedTotalSteps()).toBe(2);

      // Rendered while the user was reading the intro card
      onScreen.add('covers-grid');
      service.next();

      expect(service.displayedTotalSteps()).toBe(3);
    });

    it('re-plans when a tour restarts', () => {
      service.start('home');
      service.next();
      expect(service.displayedTotalSteps()).toBe(5);
      service.dismiss();

      onScreen.clear();
      service.start('home');
      service.next();

      expect(service.displayedTotalSteps()).toBe(2);
    });

    it('reports the final planned step as the last one', () => {
      onScreen.clear();
      service.start('home');
      service.next();
      expect(service.isLastStep()).toBe(false);

      service.next();

      expect(service.currentStep()?.id).toBe('user-menu');
      expect(service.isLastStep()).toBe(true);
    });
  });

  describe('skipUnavailableStep', () => {
    it('drops the step from the counter and moves forward', () => {
      service.start('home');
      service.next();
      service.next(); // projects-empty, whose anchor has since gone

      service.skipUnavailableStep();

      expect(service.currentStep()?.id).toBe('projects-grid');
      expect(service.displayedStepNumber()).toBe(2);
      expect(service.displayedTotalSteps()).toBe(4);
    });

    it('skips backward when the user was going back', () => {
      service.start('home');
      service.next();
      service.next();
      service.next();
      service.previous(); // now at projects-empty, moving backward

      service.skipUnavailableStep();

      expect(service.currentStep()?.id).toBe('create');
      expect(service.displayedTotalSteps()).toBe(4);
    });

    it('lands on the intro when skipping backward past the first step', () => {
      service.start('home');
      service.next();
      service.next();
      service.previous(); // now at create, moving backward

      service.skipUnavailableStep();

      expect(service.stepIndex()).toBe(0);
      expect(service.isActive()).toBe(true);
    });

    it('is a no-op on the intro, which needs no anchor', () => {
      service.start('home');

      service.skipUnavailableStep();

      expect(service.stepIndex()).toBe(0);
      expect(service.displayedTotalSteps()).toBe(5);
    });

    it('completes the tour when skipping past the final step', () => {
      service.start('home');
      while (!service.isLastStep()) {
        service.next();
      }

      service.skipUnavailableStep();

      expect(service.isActive()).toBe(false);
      expect(progress()['home']).toBe('completed');
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

  describe('turning tours off entirely', () => {
    it('is enabled by default', () => {
      expect(service.toursEnabled()).toBe(true);
    });

    it('disableTours closes the offered tour and persists the opt-out', () => {
      service.start('home');

      service.disableTours();

      expect(service.toursEnabled()).toBe(false);
      expect(stored[TOURS_ENABLED_KEY]).toBe(false);
      expect(service.isActive()).toBe(false);
      expect(progress()['home']).toBe('dismissed');
    });

    it('stops tours the user has never seen being offered', () => {
      service.disableTours();

      expect(service.shouldOffer('project')).toBe(true);
      expect(service.maybeAutoStart('project', { isMobile: false })).toBe(
        false
      );
      expect(service.maybeAutoStart('canvas', { isMobile: false })).toBe(false);
    });

    it('still starts a tour asked for explicitly', () => {
      service.disableTours();

      expect(service.start('project')).toBe(true);
      expect(service.isActive()).toBe(true);
    });

    it('survives into the next session', () => {
      service.disableTours();

      const revived = freshService();

      expect(revived.toursEnabled()).toBe(false);
      expect(revived.maybeAutoStart('project', { isMobile: false })).toBe(
        false
      );
    });

    it('setToursEnabled(true) offers unseen tours again', () => {
      service.disableTours();

      service.setToursEnabled(true);

      expect(stored[TOURS_ENABLED_KEY]).toBe(true);
      expect(service.maybeAutoStart('project', { isMobile: false })).toBe(true);
    });

    it('does not re-offer tours that were already closed', () => {
      service.start('home');
      service.disableTours();

      service.setToursEnabled(true);

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
