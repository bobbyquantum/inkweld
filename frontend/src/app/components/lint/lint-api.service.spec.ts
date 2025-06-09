import { HttpContext } from '@angular/common/http';
import { createServiceFactory, SpectatorService } from '@ngneat/spectator/vitest';

import { LintService } from '../../../api-client/api/lint.service';
import { LintRequestDto } from '../../../api-client/model/lint-request-dto';
import { LintResponseDto } from '../../../api-client/model/lint-response-dto';
import { apiErr, apiOk } from '../../../testing/utils';
import { ABORT_SIGNAL, LintApiService } from './lint-api.service';

// Add AbortSignal.timeout if it doesn't exist in the test environment
if (!('timeout' in AbortSignal)) {
  // @ts-expect-error - Adding missing API for tests
  AbortSignal.timeout = vi.fn(() => new AbortController().signal);
}

describe('LintApiService', () => {
  let spectator: SpectatorService<LintApiService>;
  let lintService: vi.Mocked<LintService>;

  const createService = createServiceFactory({
    service: LintApiService,
    mocks: [LintService],
  });

  beforeEach(() => {
    spectator = createService();
    lintService = spectator.inject(LintService) as vi.Mocked<LintService>;

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
    expect(spectator.service).toBeTruthy();
  });

  it('should call lintControllerLintParagraph with the correct parameters', async () => {
    // Mock response
    const mockResponse: LintResponseDto = {
      original_paragraph: 'test text',
      corrections: [],
      style_recommendations: [],
      source: 'openai',
    };

    // Setup mock to return the response
    lintService.lintControllerLintParagraph.mockReturnValue(
      apiOk(mockResponse)
    );

    // Call the service
    const result = await spectator.service.run('test text');

    // Assertions
    expect(lintService.lintControllerLintParagraph).toHaveBeenCalledWith(
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
    const mockResponse: LintResponseDto = {
      original_paragraph: 'test text',
      corrections: [],
      style_recommendations: [],
      source: 'openai',
    };

    // Setup mock return value
    lintService.lintControllerLintParagraph.mockReturnValue(
      apiOk(mockResponse)
    );

    // Call with custom parameters
    await spectator.service.run(
      'test text',
      'academic',
      'medium' as LintRequestDto.LevelEnum
    );

    // Verify custom parameters were passed
    expect(lintService.lintControllerLintParagraph).toHaveBeenCalledWith(
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
    lintService.lintControllerLintParagraph.mockReturnValue(
      apiOk({} as LintResponseDto)
    );

    // Spy on HttpContext.set
    const contextSpy = vi.spyOn(HttpContext.prototype, 'set');

    // Call the service
    await spectator.service.run('test text');

    // Verify context was set with the abort signal
    expect(contextSpy).toHaveBeenCalledWith(
      ABORT_SIGNAL,
      expect.any(AbortSignal)
    );
  });

  it('should handle errors and return a default response', async () => {
    // Mock an error response
    const errorMessage = 'Network error';
    lintService.lintControllerLintParagraph.mockReturnValue(
      apiErr(new Error(errorMessage))
    );

    // Spy on console.error and mock implementation to avoid noise in test output
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Call the service
    const result = await spectator.service.run('test text');

    // Assertions
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error calling lint service:',
      expect.any(Error)
    );

    // Verify default response is returned
    expect(result).toEqual({
      original_paragraph: 'test text',
      corrections: [],
      style_recommendations: [],
      source: 'openai',
    });
  });

  it('should create AbortSignal with the correct timeout value', async () => {
    // Mock response
    lintService.lintControllerLintParagraph.mockReturnValue(
      apiOk({} as LintResponseDto)
    );

    // Call the service
    await spectator.service.run('test text');

    // Verify timeout was set to 10 seconds (10000 ms)
    if ('timeout' in AbortSignal) {
      expect(AbortSignal.timeout).toHaveBeenCalledWith(10000);
    }
  });
});
