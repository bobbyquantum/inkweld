import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, expect, it, beforeEach } from 'vitest';

import { InsertLinkService } from './insert-link.service';

describe('InsertLinkService', () => {
  let service: InsertLinkService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), InsertLinkService],
    });
    service = TestBed.inject(InsertLinkService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with triggerCount of 0', () => {
    expect(service.triggerCount()).toBe(0);
  });

  it('should increment triggerCount when trigger() is called', () => {
    service.trigger();
    expect(service.triggerCount()).toBe(1);
  });

  it('should increment triggerCount on each call', () => {
    service.trigger();
    service.trigger();
    service.trigger();
    expect(service.triggerCount()).toBe(3);
  });

  it('should expose triggerCount as a readonly signal', () => {
    // The signal should not have set/update methods (it's readonly)
    const tc = service.triggerCount as unknown as Record<string, unknown>;
    expect(typeof tc['set']).toBe('undefined');
    expect(typeof tc['update']).toBe('undefined');
  });
});
