import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ZenModeService } from './zen-mode.service';

describe('ZenModeService', () => {
  it('emits on toggleRequested$ when a toggle is requested', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const service = TestBed.inject(ZenModeService);
    let count = 0;
    const sub = service.toggleRequested$.subscribe(() => count++);

    service.requestToggle();
    service.requestToggle();

    expect(count).toBe(2);
    sub.unsubscribe();
  });
});
