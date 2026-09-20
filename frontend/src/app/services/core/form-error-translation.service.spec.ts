import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { FormErrorTranslationService } from './form-error-translation.service';

describe('FormErrorTranslationService', () => {
  let service: FormErrorTranslationService;

  /**
   * Signal Forms validators attach their params (min, max, ...) alongside
   * `kind`. The service reads those reflectively, so tests build errors as
   * loose records rather than through the service's narrow public shape.
   */
  const err = (e: Record<string, unknown>) =>
    e as unknown as { kind: string; message?: string };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(FormErrorTranslationService);
  });

  it('returns an empty string when there are no errors', () => {
    expect(service.first([])).toBe('');
  });

  it('translates a known error kind', () => {
    expect(service.first([{ kind: 'required' }])).toBe(
      'This field is required'
    );
  });

  it('maps whitespace-only input onto the required message', () => {
    expect(service.first([{ kind: 'whitespace' }])).toBe(
      'This field is required'
    );
  });

  it('interpolates params from the error object', () => {
    expect(service.first([err({ kind: 'minLength', min: 8 })])).toBe(
      'Must be at least 8 characters'
    );
    expect(service.first([err({ kind: 'maxLength', max: 64 })])).toBe(
      'Cannot exceed 64 characters'
    );
  });

  it('uses only the first error when several are present', () => {
    expect(
      service.first([{ kind: 'required' }, { kind: 'emailInvalid' }])
    ).toBe('This field is required');
  });

  it('falls back to the error message for an unmapped kind', () => {
    expect(
      service.first([{ kind: 'somethingCustom', message: 'Custom message' }])
    ).toBe('Custom message');
  });

  it('falls back to the kind itself when an unmapped error has no message', () => {
    expect(service.first([{ kind: 'somethingCustom' }])).toBe(
      'somethingCustom'
    );
  });

  it('ignores non-scalar params when interpolating', () => {
    // `fieldTree` is attached by Signal Forms and must never reach Transloco.
    expect(
      service.first([
        err({
          kind: 'minLength',
          min: 3,
          fieldTree: {},
          extra: { nested: true },
        }),
      ])
    ).toBe('Must be at least 3 characters');
  });
});
