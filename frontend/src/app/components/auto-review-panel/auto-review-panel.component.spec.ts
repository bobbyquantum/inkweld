import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutoReviewSuggestionSeverity } from '@inkweld/index';
import {
  AutoReviewApiService,
  type AutoReviewSuggestion,
} from '@services/lint/auto-review.service';

import { AutoReviewPanelComponent } from './auto-review-panel.component';

describe('AutoReviewPanelComponent', () => {
  let component: AutoReviewPanelComponent;
  let mockAutoReviewApi: Partial<AutoReviewApiService>;

  beforeEach(async () => {
    mockAutoReviewApi = {
      reviewing: signal(false),
      docVersion: signal(0),
      scanDocumentMarks: vi.fn().mockReturnValue([]),
      reviewDocument: vi
        .fn()
        .mockResolvedValue({ suggestions: [], clearedMarks: 0 }),
      acceptSuggestion: vi.fn().mockResolvedValue(true),
      rejectSuggestion: vi.fn().mockResolvedValue(true),
      clearAllMarks: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AutoReviewPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AutoReviewApiService, useValue: mockAutoReviewApi },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AutoReviewPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('username', 'testuser');
    fixture.componentRef.setInput('slug', 'test-slug');
    fixture.componentRef.setInput('docId', 'doc-1');
    fixture.componentRef.setInput('canWrite', true);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show empty state when no suggestions', () => {
    expect(component.suggestions()).toEqual([]);
  });

  it('should have correct severity icon mappings', () => {
    expect(component.getSeverityIcon('error')).toBe('error');
    expect(component.getSeverityIcon('warning')).toBe('warning');
    expect(component.getSeverityIcon('suggestion')).toBe('info');
  });

  it('should have correct severity label mappings', () => {
    expect(component.getSeverityLabel('error')).toBe('Error');
    expect(component.getSeverityLabel('warning')).toBe('Warning');
    expect(component.getSeverityLabel('suggestion')).toBe('Suggestion');
  });

  it('should truncate preview text longer than 60 chars', () => {
    const longText = 'a'.repeat(70);
    const preview = component.getPreview({
      id: '1',
      message: 'msg',
      suggestion: 'sug',
      category: 'grammar',
      severity: AutoReviewSuggestionSeverity.Suggestion,
      paragraphStart: 0,
      paragraphEnd: 10,
      originalText: longText,
    });
    expect(preview.length).toBe(58);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('should not truncate short preview text', () => {
    const preview = component.getPreview({
      id: '1',
      message: 'msg',
      suggestion: 'sug',
      category: 'grammar',
      severity: AutoReviewSuggestionSeverity.Suggestion,
      paragraphStart: 0,
      paragraphEnd: 10,
      originalText: 'short text',
    });
    expect(preview).toBe('short text');
  });

  it('should toggle expanded suggestion on click', () => {
    const suggestion: AutoReviewSuggestion = {
      id: 'sug-1',
      message: 'fix',
      suggestion: 'fixed',
      category: 'grammar',
      severity: AutoReviewSuggestionSeverity.Suggestion,
      paragraphStart: 0,
      paragraphEnd: 5,
      originalText: 'test',
    };
    component.onSuggestionClick(suggestion);
    expect(component.expandedSuggestionId()).toBe('sug-1');
    component.onSuggestionClick(suggestion);
    expect(component.expandedSuggestionId()).toBe(null);
  });

  it('should call reviewDocument on review', async () => {
    await component.onReview();
    expect(mockAutoReviewApi.reviewDocument).toHaveBeenCalledWith(
      'testuser',
      'test-slug',
      'doc-1'
    );
  });

  it('should set hasReviewed true after a review runs', async () => {
    expect(component.hasReviewed()).toBe(false);
    await component.onReview();
    expect(component.hasReviewed()).toBe(true);
  });

  it('should reset hasReviewed when the review is cleared', async () => {
    await component.onReview();
    expect(component.hasReviewed()).toBe(true);
    await component.onClearAll();
    expect(component.hasReviewed()).toBe(false);
  });

  it('should show totalCount of active + resolved suggestions', async () => {
    // Initially idle: no suggestions.
    expect(component.totalCount()).toBe(0);

    // Run a review that returns no suggestions → reviewed but no items.
    await component.onReview();
    expect(component.hasReviewed()).toBe(true);
    expect(component.totalCount()).toBe(0);

    // Simulate marks appearing in the doc (e.g. via Yjs sync). The
    // computed re-evaluates suggestions against the mocked scan.
    (
      mockAutoReviewApi.scanDocumentMarks as ReturnType<typeof vi.fn>
    ).mockReturnValue([
      {
        id: 'sug-1',
        message: 'fix',
        suggestion: 'fixed',
        category: 'grammar',
        severity: AutoReviewSuggestionSeverity.Suggestion,
        paragraphStart: 0,
        paragraphEnd: 4,
        originalText: 'test',
      },
    ] satisfies AutoReviewSuggestion[]);
    (mockAutoReviewApi.docVersion as ReturnType<typeof signal>).set(1);
    expect(component.totalCount()).toBe(1);
  });

  it('should call acceptSuggestion on accept', async () => {
    const suggestion: AutoReviewSuggestion = {
      id: 'sug-1',
      message: 'fix',
      suggestion: 'fixed',
      category: 'grammar',
      severity: AutoReviewSuggestionSeverity.Suggestion,
      paragraphStart: 0,
      paragraphEnd: 5,
      originalText: 'test',
    };
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    await component.onAccept(suggestion, event);
    expect(mockAutoReviewApi.acceptSuggestion).toHaveBeenCalledWith(
      'testuser',
      'test-slug',
      'doc-1',
      'sug-1',
      'fixed'
    );
  });

  it('should call rejectSuggestion on reject', async () => {
    const suggestion: AutoReviewSuggestion = {
      id: 'sug-1',
      message: 'fix',
      suggestion: 'fixed',
      category: 'grammar',
      severity: AutoReviewSuggestionSeverity.Suggestion,
      paragraphStart: 0,
      paragraphEnd: 5,
      originalText: 'test',
    };
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    await component.onReject(suggestion, event);
    expect(mockAutoReviewApi.rejectSuggestion).toHaveBeenCalledWith(
      'testuser',
      'test-slug',
      'doc-1',
      'sug-1'
    );
  });

  it('should call clearAllMarks on clear all', async () => {
    await component.onClearAll();
    expect(mockAutoReviewApi.clearAllMarks).toHaveBeenCalledWith(
      'testuser',
      'test-slug',
      'doc-1'
    );
  });

  it('should emit closed event', () => {
    const emitted = vi.fn();
    component.closed.subscribe(emitted);
    component.onClose();
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('should emit suggestionHovered event', () => {
    const emitted = vi.fn();
    component.suggestionHovered.subscribe(emitted);
    component.onHover('sug-1');
    expect(emitted).toHaveBeenCalledWith('sug-1');
    component.onHover(null);
    expect(emitted).toHaveBeenCalledWith(null);
  });
});
