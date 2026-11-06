import { provideHttpClient, withXhr } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CommentMarkAttrs } from '@components/comment-mark/comment-mark-schema';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import {
  type CommentMessageResponse,
  CommentService,
  type CommentThreadResponse,
} from '@services/project/comment.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { CommentPopoverComponent } from './comment-popover.component';

/** Server thread ids: the server only issues UUIDs. */
const THREAD_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_THREAD_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function serverMessage(id: string, text: string): CommentMessageResponse {
  return {
    id,
    threadId: THREAD_ID,
    authorId: 'alice-id',
    authorName: 'Server Alice',
    text,
    createdAt: '2026-01-01T00:00:00Z',
    editedAt: null,
  };
}

function makeServerThread(
  overrides: Partial<CommentThreadResponse> = {}
): CommentThreadResponse {
  return {
    id: THREAD_ID,
    documentId: 'doc-1',
    projectId: 'proj-1',
    authorId: 'alice-id',
    authorName: 'Server Alice',
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    messages: [],
    ...overrides,
  };
}

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
      imports: [translocoTestProvider(), CommentPopoverComponent],
      providers: [
        provideHttpClient(withXhr()),
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
      expect(msgs).toHaveLength(1);
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

    it('should use the translated fallback when no author is known', () => {
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ authorName: undefined as unknown as string })
      );
      fixture.detectChanges();
      expect(component.threadAuthor()).toBe('Unknown');
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
    it('should emit localReply with the reply text', async () => {
      fixture.detectChanges();

      const replySpy = vi.fn();
      component.localReply.subscribe(replySpy);

      component.form.replyText().value.set('  My reply  ');
      await component.onReply();

      expect(replySpy).toHaveBeenCalledWith({
        commentId: 'test-comment',
        text: 'My reply',
      });
      expect(mockCommentService.addMessage).not.toHaveBeenCalled();
      expect(component.model().replyText).toBe('');
    });

    it('should not emit when reply text is empty', async () => {
      fixture.detectChanges();

      const replySpy = vi.fn();
      component.localReply.subscribe(replySpy);

      component.form.replyText().value.set('   ');
      await component.onReply();

      expect(replySpy).not.toHaveBeenCalled();
    });

    it('should show the reply once the editor passes back refreshed attrs', () => {
      fixture.detectChanges();
      const now = Date.now();
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({
          messageCount: 2,
          messages: JSON.stringify([
            {
              id: 'm1',
              authorName: 'Alice',
              text: 'Hello there',
              createdAt: now,
            },
            { id: 'm2', authorName: 'Bob', text: 'My reply', createdAt: now },
          ]),
        })
      );
      fixture.detectChanges();

      expect(component.messages().map(m => m.text)).toEqual([
        'Hello there',
        'My reply',
      ]);
    });
  });

  describe('onResolve (server mode)', () => {
    it('should call resolveThread and emit resolved', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockResolvedValue(makeServerThread());
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
      await vi.waitFor(() => expect(component.loading()).toBe(false));

      const resolvedSpy = vi.fn();
      component.resolved.subscribe(resolvedSpy);

      await component.onResolve();

      expect(mockCommentService.resolveThread).toHaveBeenCalledWith(
        'alice',
        'my-story',
        THREAD_ID
      );
      expect(resolvedSpy).toHaveBeenCalledWith(THREAD_ID);
    });
  });

  describe('onDelete (server mode)', () => {
    it('should call deleteThread and emit deleted', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockResolvedValue(makeServerThread());
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
      await vi.waitFor(() => expect(component.loading()).toBe(false));

      const deletedSpy = vi.fn();
      component.deleted.subscribe(deletedSpy);

      await component.onDelete();

      expect(mockCommentService.deleteThread).toHaveBeenCalledWith(
        'alice',
        'my-story',
        THREAD_ID
      );
      expect(deletedSpy).toHaveBeenCalledWith(THREAD_ID);
    });
  });

  describe('fetchThread (server mode)', () => {
    it('should fetch and set thread data when attrs are not local-only', async () => {
      const serverThread = makeServerThread({
        messages: [
          {
            id: 'sm1',
            threadId: THREAD_ID,
            authorId: 'alice-id',
            authorName: 'Server Alice',
            text: 'Server msg',
            createdAt: '2026-01-01T00:00:00Z',
            editedAt: null,
          },
        ],
      });
      mockCommentService.getThread.mockResolvedValue(serverThread);

      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false, messages: null })
      );
      fixture.detectChanges();

      // Wait for the async fetchThread from the effect
      await vi.waitFor(() => {
        expect(component.loading()).toBe(false);
      });

      expect(mockCommentService.getThread).toHaveBeenCalledWith(
        'alice',
        'my-story',
        THREAD_ID
      );
      expect(component.thread()).toBe(serverThread);
      expect(component.unavailable()).toBe(false);
      expect(component.messages()).toHaveLength(1);
      expect(component.messages()[0].text).toBe('Server msg');
      expect(component.threadAuthor()).toBe('Server Alice');
    });

    it('should handle fetchThread error gracefully', async () => {
      mockCommentService.getThread.mockRejectedValue(
        new Error('Network error')
      );

      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false, messages: null })
      );
      fixture.detectChanges();

      await vi.waitFor(() => {
        expect(component.loading()).toBe(false);
      });

      // Thread should be null on error
      expect(component.thread()).toBeNull();
      expect(component.messages()).toEqual([]);
      expect(component.unavailable()).toBe(true);
    });
  });

  describe('onUnresolve (local-only)', () => {
    it('should emit updated with resolved:false without calling the server', async () => {
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ resolved: true, localOnly: true })
      );
      fixture.detectChanges();

      const updatedSpy = vi.fn();
      component.updated.subscribe(updatedSpy);

      await component.onUnresolve();

      expect(updatedSpy).toHaveBeenCalledWith({
        commentId: 'test-comment',
        updates: { resolved: false },
      });
      expect(mockCommentService.unresolveThread).not.toHaveBeenCalled();
    });
  });

  describe('onUnresolve (server mode)', () => {
    it('should call unresolveThread and refetch thread', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockResolvedValue(
        makeServerThread({ authorName: 'Alice' })
      );

      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false, resolved: true })
      );
      fixture.detectChanges();

      await vi.waitFor(() => {
        expect(component.loading()).toBe(false);
      });

      await component.onUnresolve();

      expect(mockCommentService.unresolveThread).toHaveBeenCalledWith(
        'alice',
        'my-story',
        THREAD_ID
      );
      expect(mockCommentService.getThread).toHaveBeenCalledTimes(2);
    });

    it('should handle unresolve error gracefully', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockResolvedValue(makeServerThread());
      mockCommentService.unresolveThread.mockRejectedValue(new Error('fail'));

      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false, resolved: true })
      );
      fixture.detectChanges();

      await vi.waitFor(() => {
        expect(component.loading()).toBe(false);
      });

      // Should not throw
      await component.onUnresolve();
      expect(mockCommentService.unresolveThread).toHaveBeenCalled();
    });
  });

  describe('onReply (server mode)', () => {
    it('should call addMessage and emit updated', async () => {
      mockCommentService.isServerMode = true;
      const serverThread = makeServerThread({
        authorName: 'Alice',
        messages: [
          {
            id: 'sm1',
            threadId: THREAD_ID,
            authorId: 'alice-id',
            authorName: 'Alice',
            text: 'Original',
            createdAt: '2026-01-01T00:00:00Z',
            editedAt: null,
          },
        ],
      });
      mockCommentService.getThread.mockResolvedValue(serverThread);

      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false, messages: null })
      );
      fixture.detectChanges();

      await vi.waitFor(() => {
        expect(component.loading()).toBe(false);
      });

      const updatedSpy = vi.fn();
      component.updated.subscribe(updatedSpy);

      component.form.replyText().value.set('Server reply');
      await component.onReply();

      expect(mockCommentService.addMessage).toHaveBeenCalledWith(
        'alice',
        'my-story',
        THREAD_ID,
        'Server reply'
      );
      expect(component.model().replyText).toBe('');
      expect(updatedSpy).toHaveBeenCalled();
    });
  });

  describe('unavailable server comments', () => {
    /** Run every action the popover offers for a server thread. */
    async function tryEveryAction(): Promise<void> {
      component.form.replyText().value.set('A reply');
      await component.onReply();
      await component.onResolve();
      await component.onUnresolve();
      await component.onDelete();
    }

    function expectNoServerMutation(): void {
      expect(mockCommentService.addMessage).not.toHaveBeenCalled();
      expect(mockCommentService.resolveThread).not.toHaveBeenCalled();
      expect(mockCommentService.unresolveThread).not.toHaveBeenCalled();
      expect(mockCommentService.deleteThread).not.toHaveBeenCalled();
    }

    function query(testId: string): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector(
        `[data-testid="${testId}"]`
      );
    }

    it.each([
      '../x',
      'a/b',
      '%2e%2e/x',
      `${THREAD_ID}?x`,
      `${THREAD_ID}#x`,
      'test-comment',
    ])(
      'never sends the id %j to the server and shows a notice',
      async commentId => {
        mockCommentService.isServerMode = true;
        fixture.componentRef.setInput(
          'attrs',
          makeAttrs({
            commentId,
            localOnly: false,
            authorName: 'Cached Author',
          })
        );
        fixture.detectChanges();

        expect(component.loading()).toBe(false);
        expect(component.unavailable()).toBe(true);
        expect(mockCommentService.getThread).not.toHaveBeenCalled();

        await fixture.whenStable();
        fixture.detectChanges();
        expect(query('comment-unavailable')).not.toBeNull();
        expect(query('comment-close-btn')).not.toBeNull();
        expect(query('comment-resolve-btn')).toBeNull();
        expect(query('comment-unresolve-btn')).toBeNull();
        expect(query('comment-delete-btn')).toBeNull();
        expect(query('comment-reply-input')).toBeNull();
        expect(
          (fixture.nativeElement as HTMLElement).textContent
        ).not.toContain('Cached Author');

        const emitted = vi.fn();
        component.resolved.subscribe(emitted);
        component.deleted.subscribe(emitted);
        component.updated.subscribe(emitted);
        await tryEveryAction();
        expectNoServerMutation();
        expect(emitted).not.toHaveBeenCalled();
      }
    );

    it('offers no server actions when the thread does not load', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockRejectedValue(new Error('Not found'));
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
      await vi.waitFor(() => expect(component.loading()).toBe(false));
      fixture.detectChanges();

      expect(component.unavailable()).toBe(true);
      expect(query('comment-unavailable')).not.toBeNull();
      expect(query('comment-delete-btn')).toBeNull();

      await tryEveryAction();
      expectNoServerMutation();
    });

    it('treats an empty thread response as not loaded', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockResolvedValue(null);
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
      await vi.waitFor(() => expect(component.loading()).toBe(false));

      expect(component.unavailable()).toBe(true);
      await tryEveryAction();
      expectNoServerMutation();
    });

    it('shows the thread and its actions once it loads', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockResolvedValue(makeServerThread());
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
      await vi.waitFor(() => expect(component.loading()).toBe(false));
      fixture.detectChanges();

      expect(component.unavailable()).toBe(false);
      expect(query('comment-unavailable')).toBeNull();
      expect(query('comment-resolve-btn')).not.toBeNull();
      expect(query('comment-delete-btn')).not.toBeNull();
      expect(query('comment-reply-input')).not.toBeNull();
      expect(query('comment-reply-btn')?.getAttribute('aria-label')).toBe(
        'Send reply'
      );
    });

    it('treats a thread with another id as not loaded', async () => {
      mockCommentService.isServerMode = true;
      mockCommentService.getThread.mockResolvedValue(makeServerThread());
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: OTHER_THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
      await vi.waitFor(() => expect(component.loading()).toBe(false));

      expect(component.unavailable()).toBe(true);
      expect(component.messages()).toEqual([]);
      await tryEveryAction();
      expectNoServerMutation();
    });

    it('drops a late thread response once another mark is open', async () => {
      mockCommentService.isServerMode = true;
      let respond: (thread: CommentThreadResponse) => void = () => undefined;
      mockCommentService.getThread.mockReturnValue(
        new Promise<CommentThreadResponse>(resolve => (respond = resolve))
      );
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
      expect(component.loading()).toBe(true);

      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: '../x', localOnly: false })
      );
      fixture.detectChanges();
      respond(makeServerThread());
      await fixture.whenStable();

      expect(component.thread()).toBeNull();
      expect(component.unavailable()).toBe(true);
      await tryEveryAction();
      expectNoServerMutation();
    });

    it('keeps local-only comments working whatever their id', async () => {
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: 'local-comment', localOnly: true })
      );
      fixture.detectChanges();

      expect(component.unavailable()).toBe(false);
      expect(mockCommentService.getThread).not.toHaveBeenCalled();

      const deletedSpy = vi.fn();
      component.deleted.subscribe(deletedSpy);
      await component.onDelete();
      expect(deletedSpy).toHaveBeenCalledWith('local-comment');
      expectNoServerMutation();
    });
  });

  describe('another highlight opened during a server action', () => {
    const threadA = makeServerThread({
      authorName: 'Author A',
      messages: [serverMessage('ma1', 'First')],
    });
    const threadB = makeServerThread({
      id: OTHER_THREAD_ID,
      authorName: 'Author B',
    });

    /** Open thread A and wait for it to load. */
    async function openThreadA(): Promise<void> {
      mockCommentService.isServerMode = true;
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: THREAD_ID, localOnly: false, messageCount: 1 })
      );
      fixture.detectChanges();
      await vi.waitFor(() => expect(component.thread()).toBe(threadA));
    }

    function openThreadB(): void {
      fixture.componentRef.setInput(
        'attrs',
        makeAttrs({ commentId: OTHER_THREAD_ID, localOnly: false })
      );
      fixture.detectChanges();
    }

    /** Check that B is shown and that its actions name B. */
    async function expectThreadBOpen(): Promise<void> {
      await vi.waitFor(() => expect(component.loading()).toBe(false));
      expect(component.thread()).toBe(threadB);
      expect(component.threadAuthor()).toBe('Author B');
      expect(component.unavailable()).toBe(false);

      await component.onDelete();
      expect(mockCommentService.deleteThread).toHaveBeenCalledWith(
        'alice',
        'my-story',
        OTHER_THREAD_ID
      );
    }

    beforeEach(() => {
      mockCommentService.getThread.mockImplementation(
        (_username: string, _slug: string, id: string) =>
          Promise.resolve(id === THREAD_ID ? threadA : threadB)
      );
    });

    it('does not refresh the replied thread once another one is open', async () => {
      await openThreadA();
      let finishReply: () => void = () => undefined;
      mockCommentService.addMessage.mockReturnValue(
        new Promise<void>(resolve => (finishReply = resolve))
      );
      const updatedSpy = vi.fn();
      component.updated.subscribe(updatedSpy);

      component.form.replyText().value.set('Second');
      const reply = component.onReply();
      openThreadB();
      finishReply();
      await reply;

      expect(mockCommentService.getThread).toHaveBeenCalledTimes(2);
      expect(updatedSpy).toHaveBeenCalledWith({
        commentId: THREAD_ID,
        updates: { messageCount: 2, preview: 'Second' },
      });
      await expectThreadBOpen();
    });

    it('keeps a refresh that finishes after the switch off the open thread', async () => {
      await openThreadA();
      const refreshedA = makeServerThread({
        messages: [
          serverMessage('ma1', 'First'),
          serverMessage('ma2', 'From someone else'),
          serverMessage('ma3', 'Second'),
        ],
      });
      let finishRefresh: (thread: CommentThreadResponse) => void = () =>
        undefined;
      mockCommentService.getThread.mockReturnValueOnce(
        new Promise<CommentThreadResponse>(resolve => (finishRefresh = resolve))
      );
      const updatedSpy = vi.fn();
      component.updated.subscribe(updatedSpy);

      component.form.replyText().value.set('Second');
      const reply = component.onReply();
      await vi.waitFor(() =>
        expect(mockCommentService.getThread).toHaveBeenCalledTimes(2)
      );
      openThreadB();
      await vi.waitFor(() => expect(component.thread()).toBe(threadB));
      finishRefresh(refreshedA);
      await reply;

      expect(updatedSpy).toHaveBeenCalledWith({
        commentId: THREAD_ID,
        updates: { messageCount: 3, preview: 'Second' },
      });
      await expectThreadBOpen();
    });

    it('does not refresh the reopened thread once another one is open', async () => {
      await openThreadA();
      let finishUnresolve: () => void = () => undefined;
      mockCommentService.unresolveThread.mockReturnValue(
        new Promise<void>(resolve => (finishUnresolve = resolve))
      );
      const updatedSpy = vi.fn();
      component.updated.subscribe(updatedSpy);

      const unresolve = component.onUnresolve();
      openThreadB();
      finishUnresolve();
      await unresolve;

      expect(mockCommentService.getThread).toHaveBeenCalledTimes(2);
      expect(updatedSpy).toHaveBeenCalledWith({
        commentId: THREAD_ID,
        updates: { resolved: false },
      });
      await expectThreadBOpen();
    });
  });
});
