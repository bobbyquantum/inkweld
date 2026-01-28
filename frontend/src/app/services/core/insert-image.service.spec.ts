import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { InsertImageService } from './insert-image.service';

describe('InsertImageService', () => {
  let service: InsertImageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), InsertImageService],
    });
    service = TestBed.inject(InsertImageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial triggerCount of 0', () => {
    expect(service.triggerCount()).toBe(0);
  });

  it('should increment triggerCount when trigger is called', () => {
    expect(service.triggerCount()).toBe(0);

    service.trigger();
    expect(service.triggerCount()).toBe(1);

    service.trigger();
    expect(service.triggerCount()).toBe(2);

    service.trigger();
    expect(service.triggerCount()).toBe(3);
  });
});
