import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  COVER_OPENED_MS,
  COVER_PAGE_WAIT_MS,
  COVER_RISE_MS,
  COVER_TURN_MS,
  type CoverOpenRequest,
  ProjectCoverOpenService,
} from '@services/core/project-cover-open.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeCoverOpenGeometry,
  ProjectCoverOpenComponent,
} from './project-cover-open.component';

/** A card in the grid: 200x320, a little in from the top-left. */
const ORIGIN = { top: 120, left: 340, width: 200, height: 320 };

function makeRequest(
  overrides: Partial<CoverOpenRequest> = {}
): CoverOpenRequest {
  return {
    title: 'The Salt Road',
    username: 'testuser',
    coverUrl: null,
    origin: ORIGIN,
    pageReady: Promise.resolve(),
    ...overrides,
  };
}

describe('computeCoverOpenGeometry', () => {
  it('opens the cover beside the spine on a wide viewport', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);

    expect(geometry.stageLeft).toBe(720);
    expect(geometry.spine).toBe(720);
  });

  it('gives the cover the whole viewport when there is no room for a spread', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 420, 900);

    expect(geometry.stageLeft).toBe(0);
    expect(geometry.spine).toBe(0);
  });

  it('keeps the card΄s proportions so the cover only ever zooms', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);

    expect(geometry.stageWidth / geometry.stageHeight).toBeCloseTo(
      ORIGIN.width / ORIGIN.height,
      5
    );
  });

  it('fills the height beside the spine when the book fits', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);

    expect(geometry.stageHeight).toBe(900);
    expect(geometry.stageWidth).toBeCloseTo(562.5, 1);
    expect(geometry.stageTop).toBe(0);
  });

  it('falls back to the available width, centred, when the book is too wide', () => {
    // A landscape card cannot be 900 tall beside a 300px spine.
    const geometry = computeCoverOpenGeometry(
      { top: 0, left: 0, width: 300, height: 200 },
      600,
      900
    );

    expect(geometry.stageLeft).toBe(0);
    expect(geometry.stageWidth).toBe(600);
    expect(geometry.stageHeight).toBe(400);
    expect(geometry.stageTop).toBe(250);
  });

  it('lands the closed cover exactly over the card that was clicked', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);
    const scale = ORIGIN.height / geometry.stageHeight;

    const [, x, y, applied] =
      /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
        geometry.closed
      )!;
    expect(Number(x)).toBe(ORIGIN.left - geometry.stageLeft);
    expect(Number(y)).toBe(ORIGIN.top - geometry.stageTop);
    // Rounded for the stylesheet, but still true to a fraction of a pixel.
    expect(Number(applied)).toBeCloseTo(scale, 3);
    expect(geometry.stageWidth * Number(applied)).toBeCloseTo(ORIGIN.width, 0);
  });

  it('scales the corner radius and the type by the same zoom', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);
    const zoom = geometry.stageHeight / ORIGIN.height;

    // 12px corners and 16px type on screen, once the closed scale is applied.
    expect(geometry.radius).toBe(`${12 * zoom}px`);
    expect(geometry.typeScale).toBe(`${16 * zoom}px`);
  });

  it('survives a zero-height viewport without dividing by zero', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 0, 0);

    expect(Number.isFinite(geometry.stageWidth)).toBe(true);
    expect(Number.isFinite(geometry.stageHeight)).toBe(true);
  });
});

describe('ProjectCoverOpenComponent', () => {
  let fixture: ComponentFixture<ProjectCoverOpenComponent>;
  let request: ReturnType<typeof signal<CoverOpenRequest | null>>;
  let finish: ReturnType<typeof vi.fn>;

  /** Run the timers, then let Angular paint what they changed. */
  async function advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  /** Get past the two frames the component waits before it moves anything. */
  async function startRising(): Promise<void> {
    await advance(250);
  }

  function overlay(): HTMLElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="project-cover-open"]'
    );
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    request = signal<CoverOpenRequest | null>(null);
    finish = vi.fn(() => request.set(null));

    await TestBed.configureTestingModule({
      imports: [ProjectCoverOpenComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ProjectCoverOpenService,
          useValue: { request: request.asReadonly(), finish, cancel: finish },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectCoverOpenComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws nothing while no cover is opening', () => {
    expect(overlay()).toBeNull();
  });

  it('draws the cover closed over the card before anything moves', () => {
    request.set(makeRequest());
    fixture.detectChanges();

    const element = overlay();
    expect(element).not.toBeNull();
    expect(element!.classList.contains('cover-open--rising')).toBe(false);
    const flight = element!.querySelector<HTMLElement>('.cover-open__flight');
    expect(flight!.style.transform).toContain('scale(');
  });

  it('draws the default cover when the project has no artwork', () => {
    request.set(makeRequest());
    fixture.detectChanges();

    const element = overlay()!;
    expect(element.querySelector('.cover-open__image')).toBeNull();
    expect(element.querySelector('.cover-open__title')!.textContent).toContain(
      'The Salt Road'
    );
    expect(element.querySelector('.cover-open__author')!.textContent).toContain(
      'testuser'
    );
  });

  it('draws the cover art the card was showing', () => {
    request.set(makeRequest({ coverUrl: 'blob:http://localhost/cover-1' }));
    fixture.detectChanges();

    const image =
      overlay()!.querySelector<HTMLImageElement>('.cover-open__image');
    expect(image!.getAttribute('src')).toBe('blob:http://localhost/cover-1');
  });

  it('lets the cover go once the browser has drawn it', async () => {
    request.set(makeRequest());
    fixture.detectChanges();

    await startRising();

    const element = overlay()!;
    expect(element.classList.contains('cover-open--rising')).toBe(true);
    const flight = element.querySelector<HTMLElement>('.cover-open__flight');
    expect(flight!.style.transform).toBe('none');
  });

  it('holds the cover closed until the project page is behind it', async () => {
    let arrive = (): void => {};
    request.set(
      makeRequest({
        pageReady: new Promise<void>(resolve => {
          arrive = resolve;
        }),
      })
    );
    fixture.detectChanges();
    await startRising();

    await advance(COVER_RISE_MS);
    expect(overlay()!.classList.contains('cover-open--turning')).toBe(false);

    arrive();
    await advance(0);
    expect(overlay()!.classList.contains('cover-open--turning')).toBe(true);
  });

  it('turns anyway when the project page takes too long', async () => {
    request.set(makeRequest({ pageReady: new Promise<void>(() => {}) }));
    fixture.detectChanges();
    await startRising();

    await advance(COVER_RISE_MS + COVER_PAGE_WAIT_MS);

    expect(overlay()!.classList.contains('cover-open--turning')).toBe(true);
  });

  it('plays through to the end and clears itself', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await startRising();

    await advance(COVER_RISE_MS);
    expect(overlay()!.classList.contains('cover-open--turning')).toBe(true);

    await advance(COVER_TURN_MS);
    expect(overlay()!.classList.contains('cover-open--opened')).toBe(true);

    await advance(COVER_OPENED_MS);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(overlay()).toBeNull();
  });

  it('stops stepping when the cover is dropped mid-flight', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await startRising();

    request.set(null);
    await advance(COVER_RISE_MS + COVER_TURN_MS + COVER_OPENED_MS);

    expect(overlay()).toBeNull();
    expect(finish).not.toHaveBeenCalled();
  });

  it('starts the next cover from scratch', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await startRising();

    request.set(makeRequest({ title: 'Nightjar' }));
    fixture.detectChanges();

    const element = overlay()!;
    expect(element.classList.contains('cover-open--rising')).toBe(false);
    expect(element.querySelector('.cover-open__title')!.textContent).toContain(
      'Nightjar'
    );
  });
});
