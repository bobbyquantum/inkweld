import { provideHttpClient } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../../../services/core/logger.service';
import { SetupService } from '../../../services/core/setup.service';
import {
  CommentService,
  type CommentThreadResponse,
} from '../../../services/project/comment.service';
import { UnifiedUserService } from '../../../services/user/unified-user.service';
import type { CommentMarkAttrs } from '../comment-mark-schema';
import { CommentPanelComponent } from './comment-panel.component';

function createMockCommentService() {
  return {
    isServerMode: false,
    activeCommentId: { set: vi.fn() },
    listDocumentComments: vi.fn().mockResolvedValue([]),
    listProjectComments: vi.fn().mockResolvedValue([]),
    resolveThread: vi.fn().mockResolvedValue(undefined),
    unresolveThread: vi.fn().mockResolvedValue(undefined),
    deleteThread: vi.fn().mockResolvedValue(undefined),
    addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
  };
}

function makeThread(
  overrides: Partial<CommentThreadResponse> = {}
): CommentThreadResponse {
  return {
    id: 'thread-1',
    documentId: 'doc-1',
    projectId: 'proj-1',
    authorId: 'alice-id',
    authorName: 'Alice',
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    messages: [
      {
        id: 'msg-1',
        threadId: 'thread-1',
        authorId: 'alice-id',
        authorName: 'Alice',
        text: 'First message',
        createdAt: '2026-01-01T00:00:00Z',
        editedAt: null,
      },
    ],
    ...overrides,
  };
}

describe('CommentPanelComponent', () => {
  let component: CommentPanelComponent;
  let fixture: ComponentFixture<CommentPanelComponent>;
  let mockCommentService: ReturnType<typeof createMockCommentService>;

  beforeEach(async () => {
    mockCommentService = createMockCommentService();

    await TestBed.configureTestingModule({
      imports: [CommentPanelComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        { provide: CommentService, useValue: mockCommentService },
        { provide: SetupService, useValue: { getServerUrl: () => '' } },
        {
          provide: UnifiedUserService,
          useValue: {
            currentUser: () => ({ name: 'Alice' }),
            getMode: () => 'local',
          },
        },
        { provide: LoggerService, useValue: { warn: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommentPanelComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('getPreview', () => {
    it('should return first message text when short', () => {
      const thread = makeThread();
      expect(component.getPreview(thread)).toBe('First message');
    });

    it('should truncate text longer than 80 chars', () => {
      const long = 'x'.repeat(100);
      const thread = makeThread({
        messages: [
          {
            id: 'm1',
            threadId: 't1',
            authorId: '',
            authorName: 'A',
            text: long,
            createdAt: '',
            editedAt: null,
          },
        ],
      });
      const preview = component.getPreview(thread);
      expect(preview.length).toBeLessThanOrEqual(81);
      expect(preview).toContain('…');
    });

    it('should return empty string when no messages', () => {
      const thread = makeThread({ messages: [] });
      expect(component.getPreview(thread)).toBe('');
    });
  });

  describe('formatDate', () => {
    it('should delegate to formatRelativeDate', () => {
      // formatDate wraps formatRelativeDate — just verify it returns a string
      const result = component.formatDate('2026-01-01T00:00:00Z');
      expect(typeof result).toBe('string');
    });
  });

  describe('onThreadClick', () => {
    it('should toggle the expanded thread', () => {
      const thread = makeThread();

      // First click expands
      component.onThreadClick(thread);
      expect(component.expandedThreadId()).toBe('thread-1');
      expect(mockCommentService.activeCommentId.set).toHaveBeenCalledWith(
        'thread-1'
      );

      // Second click collapses
      component.onThreadClick(thread);
      expect(component.expandedThreadId()).toBeNull();
      expect(mockCommentService.activeCommentId.set).toHaveBeenCalledWith(null);
    });
  });

  describe('positionedThreads', () => {
    it('should resolve collisions between overlapping threads', () => {
      // Set threads signal directly
      const t1 = makeThread({ id: 'a' });
      const t2 = makeThread({ id: 'b' });
      component.threads.set([t1, t2]);

      // Both threads at the same vertical position
      fixture.componentRef.setInput('threadPositions', { a: 0, b: 0 });
      fixture.detectChanges();

      const positioned = component.positionedThreads();
      expect(positioned.length).toBe(2);
      // Second thread should be pushed below the first
      expect(positioned[1].displayTop).toBeGreaterThan(
        positioned[0].displayTop
      );
    });

    it('should sort threads by document position', () => {
      const t1 = makeThread({ id: 'a' });
      const t2 = makeThread({ id: 'b' });
      component.threads.set([t1, t2]);

      fixture.componentRef.setInput('threadPositions', { a: 200, b: 50 });
      fixture.detectChanges();

      const positioned = component.positionedThreads();
      expect(positioned[0].id).toBe('b');
      expect(positioned[1].id).toBe('a');
    });
  });

  describe('buildLocalThreads', () => {
    it('should convert comment marks to thread objects', () => {
      const marks: CommentMarkAttrs[] = [
        {
          commentId: 'local-1',
          authorName: 'Bob',
          preview: 'Preview',
          messageCount: 1,
          resolved: false,
          createdAt: Date.now(),
          localOnly: true,
          messages: JSON.stringify([
            {
              id: 'm1',
              authorName: 'Bob',
              text: 'Hello',
              createdAt: Date.now(),
            },
          ]),
        },
      ];

      fixture.componentRef.setInput('commentMarks', marks);
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      // buildLocalThreads is called via effect when isOpen && !isServerMode
      const threads = component.threads();
      expect(threads.length).toBe(1);
      expect(threads[0].id).toBe('local-1');
      expect(threads[0].authorName).toBe('Bob');
      expect(threads[0].messages.length).toBe(1);
    });
  });

  describe('onResolve (local mode)', () => {
    it('should emit commentResolved for local mode', async () => {
      const spy = vi.fn();
      component.commentResolved.subscribe(spy);

      const thread = makeThread();
      const event = new Event('click');
      vi.spyOn(event, 'stopPropagation');

      await component.onResolve(thread, event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith('thread-1');
    });
  });

  describe('onDelete (local mode)', () => {
    it('should emit commentDeleted for local mode', async () => {
      const spy = vi.fn();
      component.commentDeleted.subscribe(spy);

      const thread = makeThread();
      const event = new Event('click');
      vi.spyOn(event, 'stopPropagation');

      await component.onDelete(thread, event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith('thread-1');
    });
  });

  describe('onUnresolve (local mode)', () => {
    it('should emit commentUpdated with resolved:false', async () => {
      const spy = vi.fn();
      component.commentUpdated.subscribe(spy);

      const thread = makeThread({ resolved: true });
      const event = new Event('click');

      await component.onUnresolve(thread, event);

      expect(spy).toHaveBeenCalledWith({
        commentId: 'thread-1',
        updates: { resolved: false },
      });
    });
  });
});
