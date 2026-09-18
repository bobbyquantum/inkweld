import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type StorageUsage,
  StorageUsageService,
} from '@services/user/storage-usage.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { StorageMeterComponent } from './storage-meter.component';

function usage(overrides: Partial<StorageUsage> = {}): StorageUsage {
  return {
    usedBytes: 500,
    quotaBytes: 1000,
    fraction: 0.5,
    overQuota: false,
    overSoftLimit: false,
    projects: [],
    ...overrides,
  };
}

describe('StorageMeterComponent', () => {
  let fixture: ComponentFixture<StorageMeterComponent>;
  let load: ReturnType<typeof vi.fn>;
  let usageSignal: ReturnType<typeof vi.fn>;

  function configure(current: StorageUsage | undefined): void {
    usageSignal = vi.fn().mockReturnValue(current);
    load = vi.fn().mockResolvedValue(current);
    TestBed.configureTestingModule({
      imports: [translocoTestProvider(), StorageMeterComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: StorageUsageService,
          useValue: {
            usage: usageSignal,
            isLoading: vi.fn().mockReturnValue(false),
            load,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(StorageMeterComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders nothing until usage is known', () => {
    configure(undefined);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="storage-meter"]')).toBeFalsy();
    expect(load).toHaveBeenCalled();
  });

  it('renders used and quota labels and a normal bar', () => {
    configure(usage());
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="storage-meter"]')).toBeTruthy();
    expect(
      el.querySelector('[data-testid="storage-meter-used"]')?.textContent
    ).toContain('500 B');
    const bar = el.querySelector('[data-testid="storage-meter-bar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
  });

  it('shows warning state at or above 80%', () => {
    configure(usage({ usedBytes: 800, fraction: 0.8, overSoftLimit: true }));
    const meter = fixture.nativeElement.querySelector(
      '[data-testid="storage-meter"]'
    );
    expect(meter.classList.contains('warning')).toBe(true);
    expect(meter.classList.contains('over')).toBe(false);
  });

  it('shows over state once over quota', () => {
    configure(
      usage({
        usedBytes: 1200,
        fraction: 1.2,
        overSoftLimit: true,
        overQuota: true,
      })
    );
    const meter = fixture.nativeElement.querySelector(
      '[data-testid="storage-meter"]'
    );
    expect(meter.classList.contains('over')).toBe(true);
  });

  it('caps the bar at 100% when over quota', () => {
    configure(
      usage({ usedBytes: 5000, quotaBytes: 1000, fraction: 5, overQuota: true })
    );
    const bar = fixture.nativeElement.querySelector(
      '[data-testid="storage-meter-bar"]'
    );
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('refetches on init and passes the user id through', () => {
    usageSignal = vi.fn().mockReturnValue(usage());
    load = vi.fn().mockResolvedValue(usage());
    TestBed.configureTestingModule({
      imports: [translocoTestProvider(), StorageMeterComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: StorageUsageService,
          useValue: {
            usage: usageSignal,
            isLoading: vi.fn().mockReturnValue(false),
            load,
          },
        },
      ],
    });
    const localFixture = TestBed.createComponent(StorageMeterComponent);
    localFixture.componentRef.setInput('userId', 'user-1');
    localFixture.detectChanges();

    // The service keys its cache by user id, so the meter always delegates;
    // dedupe/refresh decisions live in the service, not here.
    expect(load).toHaveBeenCalledWith('user-1');
  });
});
