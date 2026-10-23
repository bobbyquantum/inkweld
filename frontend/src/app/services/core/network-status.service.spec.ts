import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NetworkStatusService } from './network-status.service';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    value: online,
    configurable: true,
  });
}

describe('NetworkStatusService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  afterEach(() => {
    setOnline(true);
  });

  it('starts from the browser state', () => {
    setOnline(false);
    expect(TestBed.inject(NetworkStatusService).online()).toBe(false);
  });

  it('follows online and offline events', () => {
    const service = TestBed.inject(NetworkStatusService);
    expect(service.online()).toBe(true);

    setOnline(false);
    globalThis.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(false);

    setOnline(true);
    globalThis.dispatchEvent(new Event('online'));
    expect(service.online()).toBe(true);
  });

  it('stops listening when destroyed', () => {
    const service = TestBed.inject(NetworkStatusService);
    TestBed.resetTestingModule();

    setOnline(false);
    globalThis.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(true);
  });
});
