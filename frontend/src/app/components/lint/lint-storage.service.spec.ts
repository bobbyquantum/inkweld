import { TestBed } from '@angular/core/testing';

import { CorrectionDto } from '../../../api-client/model/correction-dto';
import { ExtendedCorrectionDto } from './correction-dto.extension';
import { LintStorageService } from './lint-storage.service';

describe('LintStorageService', () => {
  let service: LintStorageService;
  let localStorageSpy: Record<string, jest.SpyInstance>;

  const mockCorrection: CorrectionDto = {
    from: 0,
    to: 5,
    suggestion: 'test suggestion',
    error: '',
  };

  const mockExtendedCorrection: ExtendedCorrectionDto = {
    ...mockCorrection,
    text: 'original text',
  };

  beforeEach(() => {
    // Mock localStorage
    localStorageSpy = {
      getItem: jest.spyOn(Storage.prototype, 'getItem'),
      setItem: jest.spyOn(Storage.prototype, 'setItem'),
      removeItem: jest.spyOn(Storage.prototype, 'removeItem'),
      clear: jest.spyOn(Storage.prototype, 'clear'),
    };

    TestBed.configureTestingModule({});
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
    jest.restoreAllMocks();
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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    service.rejectSuggestion(mockCorrection);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[LintStorage] Error saving rejected suggestions:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it('should reject suggestion when lint-correction-reject event is dispatched', () => {
    const rejectSpy = jest.spyOn(service, 'rejectSuggestion');
    const event = new CustomEvent('lint-correction-reject', {
      detail: mockCorrection,
    });

    document.dispatchEvent(event);

    expect(rejectSpy).toHaveBeenCalledWith(mockCorrection);
  });
});
