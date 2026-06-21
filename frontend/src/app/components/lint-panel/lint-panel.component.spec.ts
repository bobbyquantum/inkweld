import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { LintPanelComponent } from './lint-panel.component';
import { LintReviewApiService } from '@services/lint/lint-review-api.service';

describe('LintPanelComponent', () => {
  let component: LintPanelComponent;
  let mockLintReviewApi: Partial<LintReviewApiService>;

  beforeEach(async () => {
    mockLintReviewApi = {
      reviewing: signal(false),
      scanDocumentMarks: vi.fn().mockReturnValue([]),
      reviewDocument: vi
        .fn()
        .mockResolvedValue({ suggestions: [], clearedMarks: 0 }),
      acceptSuggestion: vi.fn().mockResolvedValue(true),
      rejectSuggestion: vi.fn().mockResolvedValue(true),
      clearAllMarks: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [LintPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LintReviewApiService, useValue: mockLintReviewApi },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LintPanelComponent);
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
    const nativeEl = TestBed.createComponent(LintPanelComponent).nativeElement;
    // The component renders; the signal-based computed returns [] by default
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
      severity: 'suggestion',
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
      severity: 'suggestion',
      paragraphStart: 0,
      paragraphEnd: 10,
      originalText: 'short text',
    });
    expect(preview).toBe('short text');
  });

  it('should toggle expanded suggestion on click', () => {
    const suggestion = {
      id: 'sug-1',
      message: 'fix',
      suggestion: 'fixed',
      category: 'grammar',
      severity: 'suggestion' as const,
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
    expect(mockLintReviewApi.reviewDocument).toHaveBeenCalledWith(
      'testuser',
      'test-slug',
      'doc-1'
    );
  });

  it('should call acceptSuggestion on accept', async () => {
    const suggestion = {
      id: 'sug-1',
      message: 'fix',
      suggestion: 'fixed',
      category: 'grammar',
      severity: 'suggestion' as const,
      paragraphStart: 0,
      paragraphEnd: 5,
      originalText: 'test',
    };
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    await component.onAccept(suggestion, event);
    expect(mockLintReviewApi.acceptSuggestion).toHaveBeenCalledWith(
      'testuser',
      'test-slug',
      'doc-1',
      'sug-1',
      'fixed'
    );
  });

  it('should call rejectSuggestion on reject', async () => {
    const suggestion = {
      id: 'sug-1',
      message: 'fix',
      suggestion: 'fixed',
      category: 'grammar',
      severity: 'suggestion' as const,
      paragraphStart: 0,
      paragraphEnd: 5,
      originalText: 'test',
    };
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    await component.onReject(suggestion, event);
    expect(mockLintReviewApi.rejectSuggestion).toHaveBeenCalledWith(
      'testuser',
      'test-slug',
      'doc-1',
      'sug-1'
    );
  });

  it('should call clearAllMarks on clear all', async () => {
    await component.onClearAll();
    expect(mockLintReviewApi.clearAllMarks).toHaveBeenCalledWith(
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
