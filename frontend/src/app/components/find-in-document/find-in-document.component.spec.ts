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
    isReplaceMode?: boolean;
  } = {}
) {
  return {
    isOpen: vi.fn().mockReturnValue(true),
    query: vi.fn().mockReturnValue(overrides.query ?? ''),
    caseSensitive: vi.fn().mockReturnValue(false),
    matchCount: vi.fn().mockReturnValue(overrides.matchCount ?? 0),
    currentMatchNumber: vi.fn().mockReturnValue(1),
    isReplaceMode: vi.fn().mockReturnValue(overrides.isReplaceMode ?? false),
    replacementText: vi.fn().mockReturnValue(''),
    search: vi.fn(),
    nextMatch: vi.fn(),
    previousMatch: vi.fn(),
    toggleCaseSensitive: vi.fn(),
    toggleReplaceMode: vi.fn(),
    setReplacementText: vi.fn(),
    replace: vi.fn().mockReturnValue(true),
    replaceAll: vi.fn().mockReturnValue(1),
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

    it('should display "No results" when query exists but no matches', async () => {
      mockFindService = createMockFindService({ matchCount: 0, query: 'test' });

      await TestBed.resetTestingModule()
        .configureTestingModule({
          imports: [FindInDocumentComponent, NoopAnimationsModule],
          providers: [
            { provide: FindInDocumentService, useValue: mockFindService },
          ],
        })
        .compileComponents();

      fixture = TestBed.createComponent(FindInDocumentComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      const matchCounter = fixture.nativeElement.querySelector(
        '[data-testid="find-match-counter"]'
      );
      expect(matchCounter.textContent).toContain('No results');
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

  describe('replace functionality', () => {
    beforeEach(async () => {
      // Create mock with replace mode enabled and matches
      mockFindService = createMockFindService({
        matchCount: 5,
        isReplaceMode: true,
      });

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

    it('should render replace bar when replace mode is enabled', () => {
      const replaceBar = fixture.nativeElement.querySelector(
        '[data-testid="replace-bar"]'
      );
      expect(replaceBar).toBeTruthy();
    });

    it('should call replace when replace button clicked', () => {
      const replaceButton = fixture.nativeElement.querySelector(
        '[data-testid="replace-single"]'
      ) as HTMLButtonElement;
      replaceButton.click();
      expect(mockFindService.replace).toHaveBeenCalled();
    });

    it('should call replaceAll when replace all button clicked', () => {
      const replaceAllButton = fixture.nativeElement.querySelector(
        '[data-testid="replace-all"]'
      ) as HTMLButtonElement;
      replaceAllButton.click();
      expect(mockFindService.replaceAll).toHaveBeenCalled();
    });

    it('should call replace on Enter in replace input', () => {
      component.onReplaceKeydown(
        new KeyboardEvent('keydown', { key: 'Enter' })
      );
      expect(mockFindService.replace).toHaveBeenCalled();
    });

    it('should call replaceAll on Shift+Enter in replace input', () => {
      component.onReplaceKeydown(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })
      );
      expect(mockFindService.replaceAll).toHaveBeenCalled();
    });

    it('should call close on Escape in replace input', () => {
      component.onReplaceKeydown(
        new KeyboardEvent('keydown', { key: 'Escape' })
      );
      expect(mockFindService.close).toHaveBeenCalled();
    });

    it('should call toggleReplaceMode when toggle button clicked', () => {
      const toggleButton = fixture.nativeElement.querySelector(
        '[data-testid="find-toggle-replace"]'
      ) as HTMLButtonElement;
      toggleButton.click();
      expect(mockFindService.toggleReplaceMode).toHaveBeenCalled();
    });
  });

  describe('keyboard shortcuts in find input', () => {
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

    it('should prevent default and select text on Ctrl+F', () => {
      const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      component.onKeydown(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent default and select text on Ctrl+Shift+F (uppercase)', () => {
      const event = new KeyboardEvent('keydown', { key: 'F', ctrlKey: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      component.onKeydown(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });
});
