import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FindInDocumentService } from '../../services/core/find-in-document.service';
import { FindInDocumentComponent } from './find-in-document.component';

/**
 * Helper to create a mock FindInDocumentService
 */
function createMockFindService(
  overrides: {
    matchCount?: number;
    query?: string;
  } = {}
) {
  return {
    isOpen: vi.fn().mockReturnValue(true),
    query: vi.fn().mockReturnValue(overrides.query ?? ''),
    caseSensitive: vi.fn().mockReturnValue(false),
    matchCount: vi.fn().mockReturnValue(overrides.matchCount ?? 0),
    currentMatchNumber: vi.fn().mockReturnValue(1),
    search: vi.fn(),
    nextMatch: vi.fn(),
    previousMatch: vi.fn(),
    toggleCaseSensitive: vi.fn(),
    close: vi.fn(),
  } as unknown as FindInDocumentService;
}

describe('FindInDocumentComponent', () => {
  let component: FindInDocumentComponent;
  let fixture: ComponentFixture<FindInDocumentComponent>;
  let mockFindService: FindInDocumentService;

  describe('basic rendering', () => {
    beforeEach(async () => {
      mockFindService = createMockFindService();

      await TestBed.configureTestingModule({
        imports: [FindInDocumentComponent, NoopAnimationsModule],
        providers: [
          { provide: FindInDocumentService, useValue: mockFindService },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(FindInDocumentComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should render the find bar', () => {
      const findBar = fixture.nativeElement.querySelector(
        '[data-testid="find-bar"]'
      );
      expect(findBar).toBeTruthy();
    });

    it('should render the search input', () => {
      const input = fixture.nativeElement.querySelector(
        '[data-testid="find-input"]'
      );
      expect(input).toBeTruthy();
    });
  });

  describe('search functionality', () => {
    beforeEach(async () => {
      mockFindService = createMockFindService();

      await TestBed.configureTestingModule({
        imports: [FindInDocumentComponent, NoopAnimationsModule],
        providers: [
          { provide: FindInDocumentService, useValue: mockFindService },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(FindInDocumentComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should call search when input changes', async () => {
      vi.useFakeTimers();

      const input = fixture.nativeElement.querySelector(
        '[data-testid="find-input"]'
      ) as HTMLInputElement;

      input.value = 'test';
      input.dispatchEvent(new Event('input'));
      component.onQueryChange('test');

      // Wait for debounce
      await vi.advanceTimersByTimeAsync(200);

      expect(mockFindService.search).toHaveBeenCalledWith('test');
    });
  });

  describe('keyboard shortcuts', () => {
    beforeEach(async () => {
      mockFindService = createMockFindService();

      await TestBed.configureTestingModule({
        imports: [FindInDocumentComponent, NoopAnimationsModule],
        providers: [
          { provide: FindInDocumentService, useValue: mockFindService },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(FindInDocumentComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should call nextMatch on Enter', () => {
      component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(mockFindService.nextMatch).toHaveBeenCalled();
    });

    it('should call previousMatch on Shift+Enter', () => {
      component.onKeydown(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })
      );
      expect(mockFindService.previousMatch).toHaveBeenCalled();
    });

    it('should call close on Escape', () => {
      component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(mockFindService.close).toHaveBeenCalled();
    });
  });

  describe('button actions (no matches)', () => {
    beforeEach(async () => {
      mockFindService = createMockFindService({ matchCount: 0 });

      await TestBed.configureTestingModule({
        imports: [FindInDocumentComponent, NoopAnimationsModule],
        providers: [
          { provide: FindInDocumentService, useValue: mockFindService },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(FindInDocumentComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should call close when close button clicked', () => {
      const closeButton = fixture.nativeElement.querySelector(
        '[data-testid="find-close"]'
      ) as HTMLButtonElement;
      closeButton.click();
      expect(mockFindService.close).toHaveBeenCalled();
    });

    it('should call toggleCaseSensitive when button clicked', () => {
      const caseSensitiveButton = fixture.nativeElement.querySelector(
        '[data-testid="find-case-sensitive"]'
      ) as HTMLButtonElement;
      caseSensitiveButton.click();
      expect(mockFindService.toggleCaseSensitive).toHaveBeenCalled();
    });
  });

  describe('button actions (with matches)', () => {
    beforeEach(async () => {
      // Create mock with matches to enable next/previous buttons
      mockFindService = createMockFindService({ matchCount: 5 });

      await TestBed.configureTestingModule({
        imports: [FindInDocumentComponent, NoopAnimationsModule],
        providers: [
          { provide: FindInDocumentService, useValue: mockFindService },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(FindInDocumentComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should call nextMatch when next button clicked', () => {
      const nextButton = fixture.nativeElement.querySelector(
        '[data-testid="find-next"]'
      ) as HTMLButtonElement;
      nextButton.click();
      expect(mockFindService.nextMatch).toHaveBeenCalled();
    });

    it('should call previousMatch when previous button clicked', () => {
      const prevButton = fixture.nativeElement.querySelector(
        '[data-testid="find-previous"]'
      ) as HTMLButtonElement;
      prevButton.click();
      expect(mockFindService.previousMatch).toHaveBeenCalled();
    });
  });
});
