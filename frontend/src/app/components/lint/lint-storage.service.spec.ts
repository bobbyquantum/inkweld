import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Correction } from '../../../api-client/model/correction';
import { LintStorageService } from './lint-storage.service';

describe('LintStorageService', () => {
  let service: LintStorageService;
  let localStorageSpy: Record<string, any>;

  const mockCorrection: Correction = {
    startPos: 0,
    endPos: 5,
    originalText: 'original text',
    correctedText: 'test suggestion',
    errorType: 'spelling',
    recommendation: 'test recommendation',
  };

  const mockExtendedCorrection: any = {
    ...mockCorrection,
    text: 'original text',
  };

  beforeEach(() => {
    // Mock localStorage
    localStorageSpy = {
      getItem: vi.spyOn(Storage.prototype, 'getItem'),
      setItem: vi.spyOn(Storage.prototype, 'setItem'),
      removeItem: vi.spyOn(Storage.prototype, 'removeItem'),
      clear: vi.spyOn(Storage.prototype, 'clear'),
    };

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(LintStorageService);

    // Clear localStorage before each test
    localStorage.clear();
    // Reset spies
    Object.values(localStorageSpy).forEach(spy => spy.mockClear());
    // Re-initialize the service to load fresh state
    (service as any).rejectedSuggestions = new Set();
    (service as any).loadRejectedSuggestions();
  });

  afterEach(() => {
    // Restore original localStorage methods
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate a unique ID for a correction', () => {
    const id = (service as any).getCorrectionId(mockCorrection);
    expect(id).toBe('0-5-test suggestion');
  });

  it('should generate a unique ID for an extended correction with text', () => {
    const id = (service as any).getCorrectionId(mockExtendedCorrection);
    expect(id).toBe('0-5-test suggestion-original text');
  });

  it('should reject a suggestion and save it to localStorage', () => {
    const id = (service as any).getCorrectionId(mockCorrection);
    expect(service.isSuggestionRejected(mockCorrection)).toBe(false);

    service.rejectSuggestion(mockCorrection);

    expect(service.isSuggestionRejected(mockCorrection)).toBe(true);
    expect(localStorageSpy['setItem']).toHaveBeenCalledWith(
      'lint-rejected-suggestions',
      JSON.stringify([id])
    );
  });

  it('should load rejected suggestions from localStorage on init', () => {
    const id1 = '0-5-test1';
    const id2 = '10-15-test2';
    localStorageSpy['getItem'].mockReturnValue(JSON.stringify([id1, id2]));

    // Re-create service to trigger constructor logic
    service = new LintStorageService();

    expect((service as any).rejectedSuggestions.has(id1)).toBe(true);
    expect((service as any).rejectedSuggestions.has(id2)).toBe(true);
    expect(localStorageSpy['getItem']).toHaveBeenCalledWith(
      'lint-rejected-suggestions'
    );
  });

  it('should handle errors when loading from localStorage', () => {
    localStorageSpy['getItem'].mockImplementation(() => {
      throw new Error('Storage error');
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Re-create service to trigger constructor logic
    service = new LintStorageService();

    expect((service as any).rejectedSuggestions.size).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[LintStorage] Error loading rejected suggestions:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it('should handle errors when saving to localStorage', () => {
    localStorageSpy['setItem'].mockImplementation(() => {
      throw new Error('Storage error');
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    service.rejectSuggestion(mockCorrection);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[LintStorage] Error saving rejected suggestions:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it('should reject suggestion when lint-correction-reject event is dispatched', () => {
    const rejectSpy = vi.spyOn(service, 'rejectSuggestion');
    const event = new CustomEvent('lint-correction-reject', {
      detail: mockCorrection,
    });

    document.dispatchEvent(event);

    expect(rejectSpy).toHaveBeenCalledWith(mockCorrection);
  });
});
