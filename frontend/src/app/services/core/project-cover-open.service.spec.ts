import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CoverOpenProject,
  ProjectCoverOpenService,
} from './project-cover-open.service';

/** A project as the grid hands it over, with its state and its actions. */
function makeProject(
  overrides: Partial<CoverOpenProject> = {}
): CoverOpenProject {
  return {
    title: 'The Salt Road',
    username: 'testuser',
    description: 'A caravan master walks a drying sea.',
    activated: signal(true),
    pinned: signal(false),
    activationRequired: true,
    shared: false,
    actions: {
      togglePin: vi.fn(),
      activate: vi.fn(() => Promise.resolve()),
      deactivate: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve(true)),
    },
    size: vi.fn(() => Promise.resolve(1024)),
    ...overrides,
  };
}

const PROJECT = makeProject();

/** A card element that measures like one in the grid. */
function makeCard(coverSrc?: string): HTMLElement {
  const card = document.createElement('div');
  card.getBoundingClientRect = () =>
    ({ top: 120, left: 340, width: 200, height: 320 }) as DOMRect;
  if (coverSrc) {
    const image = document.createElement('img');
    image.setAttribute('data-testid', 'project-cover-image');
    image.src = coverSrc;
    card.append(image);
  }
  return card;
}

describe('ProjectCoverOpenService', () => {
  let service: ProjectCoverOpenService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(ProjectCoverOpenService);
  });

  it('starts with nothing picked up', () => {
    expect(service.request()).toBeNull();
  });

  describe('select', () => {
    it('publishes the project and the card it was lifted from', () => {
      service.select(makeCard(), PROJECT, () => Promise.resolve(true));

      expect(service.request()).toMatchObject({
        title: 'The Salt Road',
        username: 'testuser',
        description: 'A caravan master walks a drying sea.',
        coverUrl: null,
        origin: { top: 120, left: 340, width: 200, height: 320 },
      });
      expect(service.stage()).toBe('selecting');
    });

    it('does not navigate — that is the second step', () => {
      const navigate = vi.fn(() => Promise.resolve(true));

      service.select(makeCard(), PROJECT, navigate);

      expect(navigate).not.toHaveBeenCalled();
    });

    it('carries over the cover art the card was already showing', () => {
      service.select(makeCard('blob:http://localhost/cover-1'), PROJECT, () =>
        Promise.resolve(true)
      );

      expect(service.request()?.coverUrl).toBe('blob:http://localhost/cover-1');
    });

    it('treats a cover image the card has hidden as no cover art', () => {
      const card = makeCard('blob:http://localhost/broken');
      card.querySelector('img')!.style.display = 'none';

      service.select(card, PROJECT, () => Promise.resolve(true));

      expect(service.request()?.coverUrl).toBeNull();
    });

    it('takes a missing description as none', () => {
      service.select(
        makeCard(),
        makeProject({ title: 'Nightjar', description: undefined }),
        () => Promise.resolve(true)
      );

      expect(service.request()?.description).toBeNull();
    });

    it('goes straight in when the card cannot be measured', () => {
      // Nothing to lift and nothing to animate from, so the reader should not
      // be made to click twice.
      const navigate = vi.fn(() => Promise.resolve(true));

      service.select(document.createElement('div'), PROJECT, navigate);

      expect(service.request()).toBeNull();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('still lifts an unmeasurable project that is not on this device', () => {
      // There is nowhere to navigate to yet: the lifted cover is the only
      // place the reader can download it from.
      const navigate = vi.fn(() => Promise.resolve(true));

      service.select(
        document.createElement('div'),
        makeProject({ activated: signal(false) }),
        navigate
      );

      expect(navigate).not.toHaveBeenCalled();
      const origin = service.request()?.origin;
      expect(origin?.width).toBeGreaterThan(0);
      expect(origin?.height).toBeGreaterThan(0);
    });

    it("carries the project's actions and state across", () => {
      const project = makeProject({ shared: true, pinned: signal(true) });

      service.select(makeCard(), project, () => Promise.resolve(true));

      const request = service.request()!;
      expect(request.shared).toBe(true);
      expect(request.pinned()).toBe(true);
      expect(request.activated()).toBe(true);
      expect(request.actions).toBe(project.actions);
      expect(request.size).toBe(project.size);
    });

    it('ignores a second project while one is already up', () => {
      service.select(makeCard(), PROJECT, () => Promise.resolve(true));
      const navigate = vi.fn(() => Promise.resolve(true));

      service.select(makeCard(), makeProject({ title: 'Nightjar' }), navigate);

      expect(service.request()?.title).toBe('The Salt Road');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('open', () => {
    it('navigates and reports the page it is waiting for', async () => {
      const navigate = vi.fn(() => Promise.resolve(true));
      service.select(makeCard(), PROJECT, navigate);

      service.open();

      expect(service.stage()).toBe('opening');
      expect(navigate).toHaveBeenCalledTimes(1);
      await expect(service.pageReady).resolves.toBeUndefined();
      expect(service.request()).not.toBeNull();
    });

    it('drops the cover when the navigation does not get there', async () => {
      service.select(makeCard(), PROJECT, () => Promise.resolve(false));

      service.open();
      await service.pageReady?.catch(() => undefined);

      expect(service.request()).toBeNull();
    });

    it('drops the cover when the navigation throws', async () => {
      service.select(makeCard(), PROJECT, () =>
        Promise.reject(new Error('guard'))
      );

      service.open();
      await service.pageReady?.catch(() => undefined);

      expect(service.request()).toBeNull();
    });

    it('navigates once however many times it is asked', () => {
      const navigate = vi.fn(() => Promise.resolve(true));
      service.select(makeCard(), PROJECT, navigate);

      service.open();
      service.open();

      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('does nothing with no cover up', () => {
      service.open();

      expect(service.stage()).toBe('selecting');
      expect(service.pageReady).toBeNull();
    });
  });

  describe('dismiss', () => {
    it('sends the cover back without navigating', () => {
      const navigate = vi.fn(() => Promise.resolve(true));
      service.select(makeCard(), PROJECT, navigate);

      service.dismiss();

      expect(service.stage()).toBe('returning');
      expect(service.request()).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('cannot call the cover back once it is opening', () => {
      service.select(makeCard(), PROJECT, () => Promise.resolve(true));
      service.open();

      service.dismiss();

      expect(service.stage()).toBe('opening');
    });
  });

  it('clears everything when the overlay finishes', () => {
    service.select(makeCard(), PROJECT, () => Promise.resolve(true));

    service.finish();

    expect(service.request()).toBeNull();
    expect(service.stage()).toBe('selecting');
    expect(service.pageReady).toBeNull();
  });
});
