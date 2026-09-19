import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COVER_VEIL_MS,
  ProjectCoverOpenService,
} from './project-cover-open.service';

const PROJECT = { title: 'The Salt Road', username: 'testuser' };

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

/** Let the service's queued navigation run. */
async function runNavigation(): Promise<void> {
  await vi.advanceTimersByTimeAsync(COVER_VEIL_MS);
}

/**
 * Run `body` with the platform asking for reduced motion.
 *
 * The replacement is built from the suite's own `matchMedia` mock so it keeps
 * the whole MediaQueryList shape: the CDK's BreakpointObserver calls the
 * deprecated `addListener` on whatever comes back, and because the suite
 * shares one environment across spec files, a stub missing it takes down
 * unrelated work that happens to be in flight. It is put back immediately
 * rather than left to the global teardown, for the same reason.
 */
function withReducedMotion(body: () => void): void {
  const matchMedia = globalThis.matchMedia;
  vi.stubGlobal('matchMedia', (query: string) => ({
    ...matchMedia(query),
    matches: query.includes('prefers-reduced-motion'),
  }));
  try {
    body();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('ProjectCoverOpenService', () => {
  let service: ProjectCoverOpenService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(ProjectCoverOpenService);
    vi.useFakeTimers();
  });

  it('starts idle', () => {
    expect(service.request()).toBeNull();
  });

  it('publishes the card it was given, measured where it sits', () => {
    service.open(makeCard(), PROJECT, () => Promise.resolve(true));

    expect(service.request()).toMatchObject({
      title: 'The Salt Road',
      username: 'testuser',
      coverUrl: null,
      origin: { top: 120, left: 340, width: 200, height: 320 },
    });
  });

  it('carries over the cover art the card was already showing', () => {
    service.open(makeCard('blob:http://localhost/cover-1'), PROJECT, () =>
      Promise.resolve(true)
    );

    expect(service.request()?.coverUrl).toBe('blob:http://localhost/cover-1');
  });

  it('treats a cover image the card has hidden as no cover art', () => {
    const card = makeCard('blob:http://localhost/broken');
    card.querySelector('img')!.style.display = 'none';

    service.open(card, PROJECT, () => Promise.resolve(true));

    expect(service.request()?.coverUrl).toBeNull();
  });

  it('holds the navigation back until the veil has covered the page', async () => {
    const navigate = vi.fn(() => Promise.resolve(true));

    service.open(makeCard(), PROJECT, navigate);
    expect(navigate).not.toHaveBeenCalled();

    await runNavigation();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('resolves pageReady once the project page has been reached', async () => {
    service.open(makeCard(), PROJECT, () => Promise.resolve(true));
    const pageReady = service.request()!.pageReady;
    await runNavigation();

    await expect(pageReady).resolves.toBeUndefined();
    expect(service.request()).not.toBeNull();
  });

  it('drops the overlay when the navigation does not get there', async () => {
    service.open(makeCard(), PROJECT, () => Promise.resolve(false));
    const pageReady = service.request()!.pageReady;
    pageReady.catch(() => undefined);

    await runNavigation();

    expect(service.request()).toBeNull();
  });

  it('drops the overlay when the navigation throws', async () => {
    service.open(makeCard(), PROJECT, () => Promise.reject(new Error('guard')));
    service.request()!.pageReady.catch(() => undefined);

    await runNavigation();

    expect(service.request()).toBeNull();
  });

  it('leaves a later animation alone when an earlier navigation fails', async () => {
    service.open(makeCard(), PROJECT, () => Promise.resolve(false));
    service.request()!.pageReady.catch(() => undefined);
    service.finish();

    const second = { title: 'Nightjar', username: 'testuser' };
    service.open(makeCard(), second, () => Promise.resolve(true));
    await runNavigation();

    expect(service.request()?.title).toBe('Nightjar');
  });

  it('ignores a second cover while one is already opening', () => {
    service.open(makeCard(), PROJECT, () => Promise.resolve(true));
    const navigate = vi.fn(() => Promise.resolve(true));

    service.open(
      makeCard(),
      { title: 'Nightjar', username: 'testuser' },
      navigate
    );

    expect(service.request()?.title).toBe('The Salt Road');
    // The second click still gets where it was going, just without a cover.
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('navigates without a cover when the card cannot be measured', () => {
    const card = document.createElement('div');
    const navigate = vi.fn(() => Promise.resolve(true));

    service.open(card, PROJECT, navigate);

    expect(service.request()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('navigates without a cover when the user asked for reduced motion', () => {
    const navigate = vi.fn(() => Promise.resolve(true));

    withReducedMotion(() => service.open(makeCard(), PROJECT, navigate));

    expect(service.request()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('clears the overlay when the animation finishes', () => {
    service.open(makeCard(), PROJECT, () => Promise.resolve(true));

    service.finish();

    expect(service.request()).toBeNull();
  });
});
