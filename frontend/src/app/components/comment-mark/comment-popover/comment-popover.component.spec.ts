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
import { CommentPopoverComponent } from './comment-popover.component';

function createMockCommentService() {
  return {
    isServerMode: false,
    getThread: vi.fn().mockResolvedValue(null),
    addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    resolveThread: vi.fn().mockResolvedValue(undefined),
    unresolveThread: vi.fn().mockResolvedValue(undefined),
    deleteThread: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAttrs(
  overrides: Partial<CommentMarkAttrs> = {}
): CommentMarkAttrs {
  return {
    commentId: 'test-comment',
    authorName: 'Alice',
    preview: 'Hello',
    messageCount: 1,
    resolved: false,
    createdAt: Date.now(),
    localOnly: true,
    messages: JSON.stringify([
      {
        id: 'm1',
        authorName: 'Alice',
        text: 'Hello there',
        createdAt: Date.now(),
      },
    ]),
    ...overrides,
  };
}

describe('CommentPopoverComponent', () => {
  let component: CommentPopoverComponent;
  let fixture: ComponentFixture<CommentPopoverComponent>;
  let mockCommentService: ReturnType<typeof createMockCommentService>;

  beforeEach(async () => {
    mockCommentService = createMockCommentService();

    await TestBed.configureTestingModule({
      imports: [CommentPopoverComponent, NoopAnimationsModule],
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

    fixture = TestBed.createComponent(CommentPopoverComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('attrs', makeAttrs());
    fixture.componentRef.setInput('username', 'alice');
    fixture.componentRef.setInput('slug', 'my-story');
    fixture.componentRef.setInput('position', { x: 100, y: 200 });
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('messages (local-only)', () => {
    it('should parse messages from attrs when local-only', () => {
      fixture.detectChanges();
      const msgs = component.messages();
      expect(msgs.length).toBe(1);
      expect(msgs[0].text).toBe('Hello there');
    });

    it('should return empty array for invalid JSON in messages', () => {
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ messages: 'not-json' })
      );
      fixture.detectChanges();
      expect(component.messages()).toEqual([]);
    });

    it('should return empty array when no messages and no thread', () => {
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ localOnly: false, messages: null })
      );
      fixture.detectChanges();
      expect(component.messages()).toEqual([]);
    });
  });

  describe('threadAuthor', () => {
    it('should fall back to attrs.authorName when no server thread', () => {
      fixture.detectChanges();
      expect(component.threadAuthor()).toBe('Alice');
    });
  });

  describe('threadDate', () => {
    it('should return a formatted date string', () => {
      fixture.detectChanges();
      expect(typeof component.threadDate()).toBe('string');
    });

    it('should return empty string when no createdAt', () => {
      fixture.componentRef.setInput('attrs', makeAttrs({ createdAt: 0 }));
      fixture.detectChanges();
      expect(component.threadDate()).toBe('');
    });
  });

  describe('adjustedPosition', () => {
    it('should offset the position below the click point', () => {
      fixture.detectChanges();
      const pos = component.adjustedPosition();
      expect(pos.top).toBeGreaterThan(200);
      expect(pos.left).toBeGreaterThanOrEqual(8);
    });

    it('should clamp to viewport bounds', () => {
      fixture.componentRef.setInput('position', { x: 99999, y: 99999 });
      fixture.detectChanges();
      const pos = component.adjustedPosition();
      // Should be clamped inside window
      expect(pos.left).toBeLessThanOrEqual(window.innerWidth);
      expect(pos.top).toBeGreaterThanOrEqual(8);
    });
  });

  describe('formatDate', () => {
    it('should return a string', () => {
      expect(typeof component.formatDate('2026-01-01T00:00:00Z')).toBe(
        'string'
      );
    });
  });

  describe('onResolve (local-only)', () => {
    it('should emit resolved and closed', async () => {
      fixture.detectChanges();

      const resolvedSpy = vi.fn();
      const closedSpy = vi.fn();
      component.resolved.subscribe(resolvedSpy);
      component.closed.subscribe(closedSpy);

      await component.onResolve();

      expect(resolvedSpy).toHaveBeenCalledWith('test-comment');
      expect(closedSpy).toHaveBeenCalled();
    });
  });

  describe('onDelete (local-only)', () => {
    it('should emit deleted and closed', async () => {
      fixture.detectChanges();

      const deletedSpy = vi.fn();
      const closedSpy = vi.fn();
      component.deleted.subscribe(deletedSpy);
      component.closed.subscribe(closedSpy);

      await component.onDelete();

      expect(deletedSpy).toHaveBeenCalledWith('test-comment');
      expect(closedSpy).toHaveBeenCalled();
    });
  });

  describe('onReply (local-only)', () => {
    it('should emit updated when reply text is provided', async () => {
      fixture.detectChanges();

      const updatedSpy = vi.fn();
      component.updated.subscribe(updatedSpy);

      component.replyText = 'My reply';
      await component.onReply();

      expect(updatedSpy).toHaveBeenCalledWith({
        commentId: 'test-comment',
        updates: { messageCount: 2 },
      });
      expect(component.replyText).toBe('');
    });

    it('should not emit when reply text is empty', async () => {
      fixture.detectChanges();

      const updatedSpy = vi.fn();
      component.updated.subscribe(updatedSpy);

      component.replyText = '   ';
      await component.onReply();

      expect(updatedSpy).not.toHaveBeenCalled();
    });
  });

  describe('onResolve (server mode)', () => {
    it('should call resolveThread and emit resolved', async () => {
      mockCommentService.isServerMode = true;
      fixture.componentRef.setInput('attrs', makeAttrs({ localOnly: false }));
      fixture.detectChanges();

      const resolvedSpy = vi.fn();
      component.resolved.subscribe(resolvedSpy);

      await component.onResolve();

      expect(mockCommentService.resolveThread).toHaveBeenCalledWith(
        'alice',
        'my-story',
        'test-comment'
      );
      expect(resolvedSpy).toHaveBeenCalledWith('test-comment');
    });
  });

  describe('onDelete (server mode)', () => {
    it('should call deleteThread and emit deleted', async () => {
      mockCommentService.isServerMode = true;
      fixture.componentRef.setInput('attrs', makeAttrs({ localOnly: false }));
      fixture.detectChanges();

      const deletedSpy = vi.fn();
      component.deleted.subscribe(deletedSpy);

      await component.onDelete();

      expect(mockCommentService.deleteThread).toHaveBeenCalledWith(
        'alice',
        'my-story',
        'test-comment'
      );
      expect(deletedSpy).toHaveBeenCalledWith('test-comment');
    });
  });

  describe('fetchThread (server mode)', () => {
    it('should fetch and set thread data when attrs are not local-only', async () => {
      const serverThread: CommentThreadResponse = {
        id: 'test-comment',
        documentId: 'doc-1',
        projectId: 'proj-1',
        authorId: 'alice-id',
        authorName: 'Server Alice',
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        messages: [
          {
            id: 'sm1',
            threadId: 'test-comment',
            authorId: 'alice-id',
            authorName: 'Server Alice',
            text: 'Server msg',
            createdAt: '2026-01-01T00:00:00Z',
            editedAt: null,
          },
        ],
      };
      mockCommentService.getThread.mockResolvedValue(serverThread);

      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ localOnly: false, messages: null })
      );
      fixture.detectChanges();

      // Wait for the async fetchThread from the effect
      await vi.waitFor(() => {
        expect(component.loading()).toBe(false);
      });

      expect(component.thread()).toBe(serverThread);
      expect(component.messages().length).toBe(1);
      expect(component.messages()[0].text).toBe('Server msg');
      expect(component.threadAuthor()).toBe('Server Alice');
    });
  });
});
