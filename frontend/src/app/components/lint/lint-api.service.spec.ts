import { HttpContext } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LintingService } from '@inkweld/api/linting.service';
import { LintRequestLevel, LintResponse } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { apiErr, apiOk } from '../../../testing/utils';
import { ABORT_SIGNAL, LintApiService } from './lint-api.service';

// Add AbortSignal.timeout if it doesn't exist in the test environment
if (!('timeout' in AbortSignal)) {
  // @ts-expect-error - Adding missing API for tests
  AbortSignal.timeout = vi.fn(() => new AbortController().signal);
}

describe('LintApiService', () => {
  let service: LintApiService;
  let lintService: DeepMockProxy<LintingService>;

  beforeEach(() => {
    lintService = mockDeep<LintingService>();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LintApiService,
        { provide: LintingService, useValue: lintService },
      ],
    });

    service = TestBed.inject(LintApiService);

    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock AbortSignal.timeout if it exists
    if ('timeout' in AbortSignal) {
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
        return new AbortController().signal;
      });
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call lintParagraph with the correct parameters', async () => {
    // Mock response
    const mockResponse: LintResponse = {
      originalParagraph: 'test text',
      corrections: [],
      styleRecommendations: [],
      source: 'openai' as any,
    };

    // Setup mock to return the response
    lintService.lintParagraph.mockReturnValue(apiOk(mockResponse));

    // Call the service
    const result = await service.run('test text');

    // Assertions
    expect(lintService.lintParagraph).toHaveBeenCalledWith(
      expect.objectContaining({
        paragraph: 'test text',
        style: 'default',
        level: 'high',
      }),
      'body',
      false,
      expect.objectContaining({
        context: expect.any(HttpContext),
      })
    );

    if ('timeout' in AbortSignal) {
      expect(AbortSignal.timeout).toHaveBeenCalledWith(10000);
    }
    expect(result).toEqual(mockResponse);
  });

  it('should pass custom style and level parameters correctly', async () => {
    // Mock response
    const mockResponse: LintResponse = {
      originalParagraph: 'test text',
      corrections: [],
      styleRecommendations: [],
      source: 'openai' as any,
    };

    // Setup mock return value
    lintService.lintParagraph.mockReturnValue(apiOk(mockResponse));

    // Call with custom parameters
    await service.run('test text', 'academic', LintRequestLevel.Medium);

    // Verify custom parameters were passed
    expect(lintService.lintParagraph).toHaveBeenCalledWith(
      expect.objectContaining({
        paragraph: 'test text',
        style: 'academic',
        level: 'medium',
      }),
      'body',
      false,
      expect.any(Object)
    );
  });

  it('should set the ABORT_SIGNAL token in the context', async () => {
    // Mock response
    lintService.lintParagraph.mockReturnValue(apiOk({} as LintResponse));

    // Spy on HttpContext.set
    const contextSpy = vi.spyOn(HttpContext.prototype, 'set');

    // Call the service
    await service.run('test text');

    // Verify context was set with the abort signal
    expect(contextSpy).toHaveBeenCalledWith(
      ABORT_SIGNAL,
      expect.any(AbortSignal)
    );
  });

  it('should handle errors and return a default response', async () => {
    // Mock an error response
    const errorMessage = 'Network error';
    lintService.lintParagraph.mockReturnValue(apiErr(new Error(errorMessage)));

    // Spy on console.error and mock implementation to avoid noise in test output
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Call the service
    const result = await service.run('test text');

    // Assertions
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error calling lint service:',
      expect.any(Error)
    );

    // Verify default response is returned
    expect(result).toEqual({
      originalParagraph: 'test text',
      corrections: [],
      styleRecommendations: [],
      source: 'openai' as any,
    });
  });

  it('should create AbortSignal with the correct timeout value', async () => {
    // Mock response
    lintService.lintParagraph.mockReturnValue(apiOk({} as LintResponse));

    // Call the service
    await service.run('test text');

    // Verify timeout was set to 10 seconds (10000 ms)
    if ('timeout' in AbortSignal) {
      expect(AbortSignal.timeout).toHaveBeenCalledWith(10000);
    }
  });
});
