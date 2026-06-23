import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutoReviewService } from '@inkweld/index';
import { AutoReviewApiService } from './auto-review.service';
import { AUTO_REVIEW_MARK_NAME } from '@inkweld/prosemirror/schema';

// Minimal prosemirror mocks for scanDocumentMarks
// Use the same object reference so `mark.type === markType` passes
const markTypeObj = { name: AUTO_REVIEW_MARK_NAME };

const mockMark = (attrs: Record<string, unknown>) => ({
  type: markTypeObj,
  attrs,
});

const mockNode = (text: string, marks: ReturnType<typeof mockMark>[]) => ({
  textContent: text,
  marks,
  nodeSize: text.length,
});

const mockDoc = {
  descendants: (fn: (node: unknown, pos: number) => boolean) => {
    fn(
      mockNode('test', [
        mockMark({
          id: 'sug-1',
          message: 'msg',
          suggestion: 'fix',
          category: 'grammar',
          severity: 'suggestion',
        }),
      ]),
      0
    );
    return false;
  },
};

const mockState = {
  schema: {
    marks: { [AUTO_REVIEW_MARK_NAME]: markTypeObj } as Record<string, unknown>,
  },
  doc: mockDoc,
};

const mockView = { state: mockState } as never;

// Minimal Observable mock
function obs<T>(value: T): {
  subscribe: (fn: { next: (v: T) => void }) => { unsubscribe: () => void };
} {
  return {
    subscribe: (fn: { next: (v: T) => void }) => {
      fn.next(value);
      return { unsubscribe: () => {} };
    },
  };
}

describe('AutoReviewApiService', () => {
  let service: AutoReviewApiService;
  let mockGeneratedService: Partial<AutoReviewService>;

  beforeEach(async () => {
    mockGeneratedService = {
      reviewDocumentAutoReview: vi
        .fn()
        .mockReturnValue(obs({ suggestions: [], clearedMarks: 0 })) as never,
      acceptAutoReviewSuggestion: vi
        .fn()
        .mockReturnValue(obs({ success: true })) as never,
      rejectAutoReviewSuggestion: vi
        .fn()
        .mockReturnValue(obs({ success: true })) as never,
      clearAutoReviewMarks: vi
        .fn()
        .mockReturnValue(obs({ success: true })) as never,
    };

    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AutoReviewService, useValue: mockGeneratedService },
      ],
    }).compileComponents();

    service = TestBed.inject(AutoReviewApiService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should call reviewDocumentAutoReview on review', async () => {
    await service.reviewDocument('user', 'slug', 'doc-1');
    expect(mockGeneratedService.reviewDocumentAutoReview).toHaveBeenCalledWith(
      'user',
      'slug',
      'doc-1',
      expect.objectContaining({ style: 'general' })
    );
  });

  it('should set reviewing signal during review', async () => {
    expect(service.reviewing()).toBe(false);
    const promise = service.reviewDocument('user', 'slug', 'doc-1');
    expect(service.reviewing()).toBe(true);
    await promise;
    expect(service.reviewing()).toBe(false);
  });

  it('should call acceptAutoReviewSuggestion on accept', async () => {
    const result = await service.acceptSuggestion(
      'user',
      'slug',
      'doc-1',
      'sug-1',
      'fixed'
    );
    expect(result).toBe(true);
    expect(
      mockGeneratedService.acceptAutoReviewSuggestion
    ).toHaveBeenCalledWith('user', 'slug', 'doc-1', {
      suggestionId: 'sug-1',
      replacement: 'fixed',
    });
  });

  it('should call rejectAutoReviewSuggestion on reject', async () => {
    const result = await service.rejectSuggestion(
      'user',
      'slug',
      'doc-1',
      'sug-1'
    );
    expect(result).toBe(true);
    expect(
      mockGeneratedService.rejectAutoReviewSuggestion
    ).toHaveBeenCalledWith('user', 'slug', 'doc-1', {
      suggestionId: 'sug-1',
    });
  });

  it('should call clearAutoReviewMarks on clear', async () => {
    await service.clearAllMarks('user', 'slug', 'doc-1');
    expect(mockGeneratedService.clearAutoReviewMarks).toHaveBeenCalledWith(
      'user',
      'slug',
      'doc-1'
    );
  });

  it('should scan document marks and return suggestions', () => {
    const suggestions = service.scanDocumentMarks(mockView);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe('sug-1');
    expect(suggestions[0].message).toBe('msg');
  });
});
