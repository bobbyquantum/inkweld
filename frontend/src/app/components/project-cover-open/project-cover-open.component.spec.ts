import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type CoverOpenRequest,
  type CoverOpenStage,
  ProjectCoverOpenService,
} from '@services/core/project-cover-open.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
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
    description: 'A caravan master walks a drying sea.',
    coverUrl: null,
    origin: ORIGIN,
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
    size: vi.fn(() => Promise.resolve(2048)),
    ...overrides,
  };
}

describe('computeCoverOpenGeometry', () => {
  it('hangs the cover on the left edge, where its hinge is', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);

    expect(geometry.stageLeft).toBe(0);
    expect(geometry.hasDetails).toBe(true);
  });

  it("keeps the card's proportions so the cover only ever zooms", () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);

    expect(geometry.stageWidth / geometry.stageHeight).toBeCloseTo(
      ORIGIN.width / ORIGIN.height,
      5
    );
  });

  it('leaves room beside the cover for the details', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);

    expect(geometry.stageHeight).toBe(810);
    expect(geometry.stageWidth).toBeCloseTo(506.25, 1);
    // Half the screen still free for the title and description.
    expect(geometry.stageWidth).toBeLessThan(720);
  });

  it('never lets the cover take more than half the width', () => {
    // A landscape card would otherwise run over the details beside it.
    const geometry = computeCoverOpenGeometry(
      { top: 0, left: 0, width: 300, height: 200 },
      1200,
      900
    );

    expect(geometry.stageWidth).toBeLessThanOrEqual(600);
    expect(geometry.hasDetails).toBe(true);
  });

  it('centres the cover and drops the details on a narrow screen', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 414, 896);

    expect(geometry.hasDetails).toBe(false);
    expect(geometry.stageLeft).toBeGreaterThan(0);
    // Room left under it for the title and the begin button.
    expect(geometry.stageTop + geometry.stageHeight).toBeLessThan(896);
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
    expect(Number(applied)).toBeCloseTo(scale, 3);
    expect(geometry.stageWidth * Number(applied)).toBeCloseTo(ORIGIN.width, 0);
  });

  it('scales the corner radius and the type by the same zoom', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 1440, 900);
    const zoom = geometry.stageHeight / ORIGIN.height;

    expect(geometry.radius).toBe(`${12 * zoom}px`);
    expect(geometry.typeScale).toBe(`${16 * zoom}px`);
  });

  it('survives a zero-sized viewport without dividing by zero', () => {
    const geometry = computeCoverOpenGeometry(ORIGIN, 0, 0);

    expect(Number.isFinite(geometry.stageWidth)).toBe(true);
    expect(Number.isFinite(geometry.stageHeight)).toBe(true);
  });
});

describe('ProjectCoverOpenComponent', () => {
  let fixture: ComponentFixture<ProjectCoverOpenComponent>;
  let request: ReturnType<typeof signal<CoverOpenRequest | null>>;
  let stage: ReturnType<typeof signal<CoverOpenStage>>;
  let service: {
    request: unknown;
    stage: unknown;
    pageReady: Promise<void> | null;
    open: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    finish: ReturnType<typeof vi.fn>;
  };

  /**
   * Let the overlay's frames and its zero-length waits run, then repaint.
   * Long enough to cover a real animation frame — the overlay waits for two
   * before it moves anything, and jsdom fires them about 16ms apart.
   */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    fixture.detectChanges();
  }

  function overlay(): HTMLElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="project-cover-open"]'
    );
  }

  /** The one button the cover offers: the way in, or the way to fetch it. */
  function begin(): HTMLButtonElement {
    return overlay()!.querySelector<HTMLButtonElement>(
      '[data-testid="cover-open-begin"]'
    )!;
  }

  beforeEach(async () => {
    // Reduced motion, so the sequence runs on zero-length waits instead of
    // the real ones. Built from the suite's own mock so the whole
    // MediaQueryList shape survives — the CDK calls addListener on it.
    const matchMedia = globalThis.matchMedia;
    vi.stubGlobal('matchMedia', (query: string) => ({
      ...matchMedia(query),
      matches: query.includes('prefers-reduced-motion'),
    }));

    request = signal<CoverOpenRequest | null>(null);
    stage = signal<CoverOpenStage>('selecting');
    service = {
      request: request.asReadonly(),
      stage: stage.asReadonly(),
      pageReady: null,
      open: vi.fn(() => stage.set('opening')),
      dismiss: vi.fn(() => stage.set('returning')),
      finish: vi.fn(() => request.set(null)),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ProjectCoverOpenComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectCoverOpenService, useValue: service },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectCoverOpenComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws nothing while the grid is untouched', () => {
    expect(overlay()).toBeNull();
  });

  it('draws the cover over its card before anything moves', () => {
    request.set(makeRequest());
    fixture.detectChanges();

    const element = overlay();
    expect(element).not.toBeNull();
    expect(element!.classList.contains('cover-open--lifted')).toBe(false);
    const flight = element!.querySelector<HTMLElement>('.cover-open__flight');
    expect(flight!.style.transform).toContain('scale(');
  });

  it('lifts the cover out and shows the project beside it', async () => {
    request.set(makeRequest());
    fixture.detectChanges();

    await settle();

    const element = overlay()!;
    expect(element.classList.contains('cover-open--lifted')).toBe(true);
    expect(
      element.querySelector<HTMLElement>('.cover-open__flight')!.style.transform
    ).toBe('none');
    const details = element.querySelector('[data-testid="cover-open-details"]');
    expect(details!.textContent).toContain('The Salt Road');
    expect(details!.textContent).toContain(
      'A caravan master walks a drying sea.'
    );
  });

  it('draws the cover art the card was showing', () => {
    request.set(makeRequest({ coverUrl: 'blob:http://localhost/cover-1' }));
    fixture.detectChanges();

    const image =
      overlay()!.querySelector<HTMLImageElement>('.cover-open__image');
    expect(image!.getAttribute('src')).toBe('blob:http://localhost/cover-1');
  });

  it('draws the default cover when the project has no artwork', () => {
    request.set(makeRequest());
    fixture.detectChanges();

    const element = overlay()!;
    expect(element.querySelector('.cover-open__image')).toBeNull();
    expect(element.querySelector('.cover-open__title')!.textContent).toContain(
      'The Salt Road'
    );
  });

  it('goes in when the begin button is pressed', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    overlay()!
      .querySelector<HTMLButtonElement>('[data-testid="cover-open-begin"]')!
      .click();

    expect(service.open).toHaveBeenCalledTimes(1);
  });

  it('goes in when anywhere else is clicked', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    overlay()!.click();

    expect(service.open).toHaveBeenCalledTimes(1);
  });

  it('backs out on the close button without going in', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    overlay()!
      .querySelector<HTMLButtonElement>('[data-testid="cover-open-close"]')!
      .click();

    expect(service.dismiss).toHaveBeenCalledTimes(1);
    expect(service.open).not.toHaveBeenCalled();
  });

  it('backs out on Escape', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    overlay()!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(service.dismiss).toHaveBeenCalledTimes(1);
  });

  it('holds the cover mid-turn until the project page is behind it', async () => {
    let arrive = (): void => {};
    service.pageReady = new Promise<void>(resolve => {
      arrive = resolve;
    });
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    stage.set('opening');
    await settle();
    expect(overlay()!.classList.contains('cover-open--turning')).toBe(true);
    expect(service.finish).not.toHaveBeenCalled();

    arrive();
    await settle();
    expect(service.finish).toHaveBeenCalled();
  });

  it('swings the cover open and clears itself', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    stage.set('opening');
    await settle();

    expect(service.finish).toHaveBeenCalled();
  });

  it('puts the cover back on its card when dismissed', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    stage.set('returning');
    await settle();

    expect(service.finish).toHaveBeenCalled();
    expect(service.open).not.toHaveBeenCalled();
  });

  it('lifts the overlay container so its own menus can be seen', async () => {
    request.set(makeRequest());
    fixture.detectChanges();
    await settle();

    expect(document.body.classList.contains('cover-lifted')).toBe(true);

    request.set(null);
    fixture.detectChanges();

    expect(document.body.classList.contains('cover-lifted')).toBe(false);
  });

  describe('size', () => {
    it('shows what the project takes up once the answer lands', async () => {
      request.set(makeRequest());
      fixture.detectChanges();
      await settle();

      const size = overlay()!.querySelector('[data-testid="cover-open-size"]');
      expect(size!.textContent).toContain('2 KB');
    });

    it('says how much a project not on this device would cost to fetch', async () => {
      request.set(makeRequest({ activated: signal(false) }));
      fixture.detectChanges();
      await settle();

      const size = overlay()!.querySelector('[data-testid="cover-open-size"]');
      expect(size!.textContent).toContain('2 KB to download');
    });

    it('shows nothing at all when no size can be had', async () => {
      request.set(makeRequest({ size: () => Promise.resolve(null) }));
      fixture.detectChanges();
      await settle();

      expect(
        overlay()!.querySelector('[data-testid="cover-open-size"]')
      ).toBeNull();
    });

    it('carries on when the size cannot be fetched', async () => {
      request.set(
        makeRequest({ size: () => Promise.reject(new Error('offline')) })
      );
      fixture.detectChanges();
      await settle();

      expect(
        overlay()!.querySelector('[data-testid="cover-open-size"]')
      ).toBeNull();
      expect(begin().textContent).toContain('Begin');
    });
  });

  describe('a project that is not on this device', () => {
    it('offers to download it rather than to go in', async () => {
      request.set(makeRequest({ activated: signal(false) }));
      fixture.detectChanges();
      await settle();

      expect(begin().textContent).toContain('Download to this device');
    });

    it('downloads instead of opening, and stays up while it does', async () => {
      const cover = makeRequest({ activated: signal(false) });
      request.set(cover);
      fixture.detectChanges();
      await settle();

      begin().click();
      await settle();

      expect(cover.actions.activate).toHaveBeenCalledTimes(1);
      expect(service.open).not.toHaveBeenCalled();
      expect(service.finish).not.toHaveBeenCalled();
    });

    it('will not start a second download over the first', async () => {
      const cover = makeRequest({
        activated: signal(false),
        actions: {
          togglePin: vi.fn(),
          activate: vi.fn(() => new Promise<void>(() => {})),
          deactivate: vi.fn(() => Promise.resolve()),
          delete: vi.fn(() => Promise.resolve(true)),
        },
      });
      request.set(cover);
      fixture.detectChanges();
      await settle();

      overlay()!.click();
      await settle();
      overlay()!.click();
      await settle();

      expect(cover.actions.activate).toHaveBeenCalledTimes(1);
    });

    it('turns into the way in once the download has landed', async () => {
      const activated = signal(false);
      const cover = makeRequest({ activated });
      request.set(cover);
      fixture.detectChanges();
      await settle();

      activated.set(true);
      await settle();

      expect(begin().textContent).toContain('Begin');
      begin().click();
      expect(service.open).toHaveBeenCalledTimes(1);
    });
  });

  describe("the project's own actions", () => {
    /** Open the menu beside the close button and find one of its items. */
    async function menuItem(testid: string): Promise<HTMLButtonElement | null> {
      overlay()!
        .querySelector<HTMLButtonElement>('[data-testid="cover-open-menu"]')!
        .click();
      await settle();
      return document.querySelector<HTMLButtonElement>(
        `[data-testid="${testid}"]`
      );
    }

    it('pins the project without going in', async () => {
      const cover = makeRequest();
      request.set(cover);
      fixture.detectChanges();
      await settle();

      (await menuItem('cover-open-pin'))!.click();
      await settle();

      expect(cover.actions.togglePin).toHaveBeenCalledTimes(1);
      expect(service.open).not.toHaveBeenCalled();
    });

    it('offers to drop a project that is on this device', async () => {
      const cover = makeRequest();
      request.set(cover);
      fixture.detectChanges();
      await settle();

      (await menuItem('cover-open-deactivate'))!.click();
      await settle();

      expect(cover.actions.deactivate).toHaveBeenCalledTimes(1);
      expect(service.open).not.toHaveBeenCalled();
    });

    it('clears itself once the project has been deleted', async () => {
      const cover = makeRequest();
      request.set(cover);
      fixture.detectChanges();
      await settle();

      (await menuItem('cover-open-delete'))!.click();
      await settle();

      expect(cover.actions.delete).toHaveBeenCalledTimes(1);
      expect(service.finish).toHaveBeenCalled();
    });

    it('stays up when the reader backs out of the delete', async () => {
      const cover = makeRequest({
        actions: {
          togglePin: vi.fn(),
          activate: vi.fn(() => Promise.resolve()),
          deactivate: vi.fn(() => Promise.resolve()),
          delete: vi.fn(() => Promise.resolve(false)),
        },
      });
      request.set(cover);
      fixture.detectChanges();
      await settle();

      (await menuItem('cover-open-delete'))!.click();
      await settle();

      expect(service.finish).not.toHaveBeenCalled();
    });

    it('does not offer to drop a project the browser is the only copy of', async () => {
      // A browser-only profile has no server behind it, so there is nothing
      // to drop back to.
      request.set(makeRequest({ activationRequired: false }));
      fixture.detectChanges();
      await settle();

      expect(await menuItem('cover-open-pin')).not.toBeNull();
      expect(
        document.querySelector('[data-testid="cover-open-deactivate"]')
      ).toBeNull();
      expect(
        document.querySelector('[data-testid="cover-open-activate"]')
      ).toBeNull();
      expect(
        document.querySelector('[data-testid="cover-open-delete"]')
      ).not.toBeNull();
    });

    it("does not offer to delete someone else's project", async () => {
      request.set(makeRequest({ shared: true }));
      fixture.detectChanges();
      await settle();

      // One opening: asking twice would close the menu again.
      expect(await menuItem('cover-open-pin')).not.toBeNull();
      expect(
        document.querySelector('[data-testid="cover-open-delete"]')
      ).toBeNull();
    });
  });
});
