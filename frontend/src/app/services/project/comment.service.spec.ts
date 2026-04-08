import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { commentMarkSpec } from '../../components/comment-mark/comment-mark-schema';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { UnifiedUserService } from '../user/unified-user.service';
import { CommentService } from './comment.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createSchema() {
  return new Schema({
    nodes: {
      doc: { content: 'text*' },
      text: { inline: true },
    },
    marks: { comment: commentMarkSpec },
  });
}

function createView(
  schema: Schema,
  content = 'Hello World'
): { view: EditorView; container: HTMLElement } {
  const doc = schema.node('doc', null, [schema.text(content)]);
  const state = EditorState.create({ doc, schema });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new EditorView(container, { state });
  return { view, container };
}

describe('CommentService', () => {
  let service: CommentService;
  let httpMock: HttpTestingController;
  let mockSetupService: { getServerUrl: ReturnType<typeof vi.fn> };
  let mockUserService: { currentUser: ReturnType<typeof vi.fn> };
  let mockLogger: {
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let container: HTMLElement | null = null;

  beforeEach(() => {
    mockSetupService = { getServerUrl: vi.fn().mockReturnValue('') };
    mockUserService = {
      currentUser: vi
        .fn()
        .mockReturnValue({ name: 'Alice', username: 'alice' }),
    };
    mockLogger = { warn: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CommentService,
        { provide: SetupService, useValue: mockSetupService },
        { provide: UnifiedUserService, useValue: mockUserService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(CommentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    container?.remove();
    container = null;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Basic
  // ─────────────────────────────────────────────────────────────────────────

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should report isServerMode false when basePath is empty', () => {
    expect(service.isServerMode).toBe(false);
  });

  it('should report isServerMode true when basePath is set', () => {
    mockSetupService.getServerUrl.mockReturnValue('http://localhost:8333');
    expect(service.isServerMode).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addComment — local-only mode
  // ─────────────────────────────────────────────────────────────────────────

  describe('addComment (local-only)', () => {
    it('should return null for empty selection', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      const id = await service.addComment(result.view, 'Test', 'user', 'slug');
      expect(id).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should add a local comment mark when basePath is empty', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      const commentId = await service.addComment(
        result.view,
        'Nice paragraph',
        'user',
        'slug',
        0,
        5
      );

      expect(commentId).toBeTruthy();

      // Verify the mark was applied
      const marks = service.getCommentMarks(result.view);
      expect(marks.length).toBe(1);
      expect(marks[0].localOnly).toBe(true);
      expect(marks[0].authorName).toBe('Alice');
    });

    it('should store the message text in the mark', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      await service.addComment(result.view, 'My comment', 'user', 'slug', 0, 5);

      const marks = service.getCommentMarks(result.view);
      expect(marks[0].messages).toBeTruthy();
      const parsed = JSON.parse(marks[0].messages!);
      expect(parsed[0].text).toBe('My comment');
    });

    it('should truncate long preview text', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      const longText = 'x'.repeat(200);
      await service.addComment(result.view, longText, 'user', 'slug', 0, 5);

      const marks = service.getCommentMarks(result.view);
      expect(marks[0].preview.length).toBeLessThanOrEqual(101);
      expect(marks[0].preview).toContain('…');
    });

    it('should return null if comment mark type is missing from schema', async () => {
      const noCommentSchema = new Schema({
        nodes: { doc: { content: 'text*' }, text: { inline: true } },
      });
      const doc = noCommentSchema.node('doc', null, [
        noCommentSchema.text('Hello'),
      ]);
      const state = EditorState.create({ doc, schema: noCommentSchema });
      container = document.createElement('div');
      document.body.appendChild(container);
      const view = new EditorView(container, { state });

      const id = await service.addComment(view, 'Test', 'u', 's', 0, 5);
      expect(id).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addComment — server mode
  // ─────────────────────────────────────────────────────────────────────────

  describe('addComment (server mode)', () => {
    beforeEach(() => {
      mockSetupService.getServerUrl.mockReturnValue('http://localhost:8333');
      service.setActiveDocumentId('doc-1');
    });

    it('should create a thread via HTTP and apply the mark', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      const addPromise = service.addComment(
        result.view,
        'Server comment',
        'alice',
        'my-story',
        0,
        5
      );

      const req = httpMock.expectOne(
        r => r.url === 'http://localhost:8333/api/v1/comments/alice/my-story'
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body.text).toBe('Server comment');
      expect(req.request.body.documentId).toBe('doc-1');

      req.flush({
        id: req.request.body.id,
        documentId: 'doc-1',
        projectId: 'proj-1',
        authorId: 'alice-id',
        authorName: 'Alice',
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        messages: [],
      });

      const id = await addPromise;
      expect(id).toBeTruthy();

      const marks = service.getCommentMarks(result.view);
      expect(marks.length).toBe(1);
      expect(marks[0].localOnly).toBe(false);
      expect(marks[0].authorName).toBe('Alice');
    });

    it('should return null when activeDocumentId is not set', async () => {
      service.setActiveDocumentId(null);
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      const id = await service.addComment(
        result.view,
        'Test',
        'alice',
        'slug',
        0,
        5
      );
      expect(id).toBeNull();
    });

    it('should return null on HTTP error', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      const addPromise = service.addComment(
        result.view,
        'Fail',
        'alice',
        'slug',
        0,
        5
      );

      const req = httpMock.expectOne(
        r => r.url === 'http://localhost:8333/api/v1/comments/alice/slug'
      );
      req.flush('Internal Server Error', {
        status: 500,
        statusText: 'Server Error',
      });

      const id = await addPromise;
      expect(id).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // removeCommentMark
  // ─────────────────────────────────────────────────────────────────────────

  describe('removeCommentMark', () => {
    it('should remove the mark with the given commentId', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      await service.addComment(result.view, 'Will remove', 'u', 's', 0, 5);
      const marks = service.getCommentMarks(result.view);
      expect(marks.length).toBe(1);

      service.removeCommentMark(result.view, marks[0].commentId);
      expect(service.getCommentMarks(result.view).length).toBe(0);
    });

    it('should do nothing if commentId does not exist', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      await service.addComment(result.view, 'Keep', 'u', 's', 0, 5);

      service.removeCommentMark(result.view, 'nonexistent');
      expect(service.getCommentMarks(result.view).length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateCommentMarkCache
  // ─────────────────────────────────────────────────────────────────────────

  describe('updateCommentMarkCache', () => {
    it('should update cached attributes on a mark', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      await service.addComment(result.view, 'Update me', 'u', 's', 0, 5);
      const marks = service.getCommentMarks(result.view);
      const id = marks[0].commentId;

      service.updateCommentMarkCache(result.view, id, {
        resolved: true,
        messageCount: 5,
      });

      const updated = service.getCommentMarks(result.view);
      expect(updated[0].resolved).toBe(true);
      expect(updated[0].messageCount).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getCommentMarks / getCommentMarksWithPositions
  // ─────────────────────────────────────────────────────────────────────────

  describe('getCommentMarks', () => {
    it('should return empty array when no comment marks exist', () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;
      expect(service.getCommentMarks(result.view)).toEqual([]);
    });

    it('should deduplicate by commentId', () => {
      const schema = createSchema();
      const result = createView(schema, 'AABBCC');
      container = result.container;

      // Apply same commentId to two ranges
      const commentType = schema.marks['comment'];
      const mark = commentType.create({ commentId: 'dup-id', localOnly: true });
      let tr = result.view.state.tr.addMark(0, 2, mark);
      tr = tr.addMark(4, 6, mark);
      result.view.dispatch(tr);

      const marks = service.getCommentMarks(result.view);
      expect(marks.length).toBe(1);
    });

    it('should return empty array when schema has no comment mark type', () => {
      const noCommentSchema = new Schema({
        nodes: { doc: { content: 'text*' }, text: { inline: true } },
      });
      const doc = noCommentSchema.node('doc', null, [
        noCommentSchema.text('Hi'),
      ]);
      const state = EditorState.create({ doc, schema: noCommentSchema });
      container = document.createElement('div');
      document.body.appendChild(container);
      const view = new EditorView(container, { state });

      expect(service.getCommentMarks(view)).toEqual([]);
    });
  });

  describe('getCommentMarksWithPositions', () => {
    it('should return marks with their starting positions', async () => {
      const schema = createSchema();
      const result = createView(schema, 'Hello World');
      container = result.container;

      await service.addComment(result.view, 'First', 'u', 's', 0, 5);

      const marksWithPos = service.getCommentMarksWithPositions(result.view);
      expect(marksWithPos.length).toBe(1);
      expect(marksWithPos[0].from).toBe(0);
      expect(marksWithPos[0].attrs.commentId).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addLocalReply
  // ─────────────────────────────────────────────────────────────────────────

  describe('addLocalReply', () => {
    it('should append a reply to a local-only comment', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      await service.addComment(result.view, 'Original', 'u', 's', 0, 5);
      const marks = service.getCommentMarks(result.view);
      const id = marks[0].commentId;

      service.addLocalReply(result.view, id, 'Reply text');

      const updated = service.getCommentMarks(result.view);
      const msgs = JSON.parse(updated[0].messages!);
      expect(msgs.length).toBe(2);
      expect(msgs[1].text).toBe('Reply text');
      expect(updated[0].messageCount).toBe(2);
    });

    it('should not add a reply to a non-existent comment', () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      service.addLocalReply(result.view, 'nonexistent', 'Reply');
      // Should not throw
    });

    it('should handle malformed JSON in messages attribute', () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      // Manually create a mark with invalid JSON in messages attribute
      const commentType = schema.marks['comment'];
      const mark = commentType.create({
        commentId: 'bad-json',
        authorName: 'Alice',
        preview: 'Preview',
        messageCount: 1,
        resolved: false,
        createdAt: Date.now(),
        localOnly: true,
        messages: '{invalid json[',
      });
      const tr = result.view.state.tr.addMark(0, 5, mark);
      result.view.dispatch(tr);

      // addLocalReply should recover from bad JSON and start fresh
      service.addLocalReply(result.view, 'bad-json', 'New reply');

      const marks = service.getCommentMarks(result.view);
      const msgs = JSON.parse(marks[0].messages!);
      expect(msgs.length).toBe(1);
      expect(msgs[0].text).toBe('New reply');
    });

    it('should handle null messages attribute', () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      const commentType = schema.marks['comment'];
      const mark = commentType.create({
        commentId: 'no-msgs',
        authorName: 'Alice',
        preview: 'Preview',
        messageCount: 0,
        resolved: false,
        createdAt: Date.now(),
        localOnly: true,
        messages: null,
      });
      const tr = result.view.state.tr.addMark(0, 5, mark);
      result.view.dispatch(tr);

      service.addLocalReply(result.view, 'no-msgs', 'First reply');

      const marks = service.getCommentMarks(result.view);
      const msgs = JSON.parse(marks[0].messages!);
      expect(msgs.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // resolveLocalComment
  // ─────────────────────────────────────────────────────────────────────────

  describe('resolveLocalComment', () => {
    it('should remove the mark (same as removeCommentMark)', async () => {
      const schema = createSchema();
      const result = createView(schema);
      container = result.container;

      await service.addComment(result.view, 'Resolve me', 'u', 's', 0, 5);
      const marks = service.getCommentMarks(result.view);

      service.resolveLocalComment(result.view, marks[0].commentId);
      expect(service.getCommentMarks(result.view).length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REST API operations
  // ─────────────────────────────────────────────────────────────────────────

  describe('REST API methods', () => {
    beforeEach(() => {
      mockSetupService.getServerUrl.mockReturnValue('http://localhost:8333');
    });

    it('getThread should GET the correct URL', async () => {
      const promise = service.getThread('alice', 'story', 'thread-1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/threads/thread-1'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ id: 'thread-1', messages: [] });
      await promise;
    });

    it('listDocumentComments should GET the correct URL', async () => {
      const promise = service.listDocumentComments('alice', 'story', 'ch1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/doc/ch1'
      );
      expect(req.request.method).toBe('GET');
      req.flush([]);
      await promise;
    });

    it('listProjectComments should GET the correct URL', async () => {
      const promise = service.listProjectComments('alice', 'story');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story'
      );
      expect(req.request.method).toBe('GET');
      req.flush([]);
      await promise;
    });

    it('addMessage should POST the text', async () => {
      const promise = service.addMessage('alice', 'story', 't1', 'Hello');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/threads/t1/messages'
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ text: 'Hello' });
      req.flush({ id: 'msg-1' });
      await promise;
    });

    it('resolveThread should PATCH the correct URL', async () => {
      const promise = service.resolveThread('alice', 'story', 't1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/threads/t1/resolve'
      );
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      await promise;
    });

    it('unresolveThread should PATCH the correct URL', async () => {
      const promise = service.unresolveThread('alice', 'story', 't1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/threads/t1/unresolve'
      );
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      await promise;
    });

    it('deleteThread should DELETE the correct URL', async () => {
      const promise = service.deleteThread('alice', 'story', 't1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/threads/t1'
      );
      expect(req.request.method).toBe('DELETE');
      req.flush({});
      await promise;
    });

    it('deleteMessage should DELETE the correct URL', async () => {
      const promise = service.deleteMessage('alice', 'story', 't1', 'm1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/threads/t1/messages/m1'
      );
      expect(req.request.method).toBe('DELETE');
      req.flush({ message: 'ok', threadDeleted: false });
      const result = await promise;
      expect(result.threadDeleted).toBe(false);
    });

    it('fetchUnreadCounts should update the unreadCounts signal', async () => {
      const promise = service.fetchUnreadCounts('alice', 'story');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/unread'
      );
      req.flush([
        { documentId: 'doc-1', count: 3 },
        { documentId: 'doc-2', count: 1 },
      ]);
      await promise;

      const counts = service.unreadCounts();
      expect(counts.get('doc-1')).toBe(3);
      expect(counts.get('doc-2')).toBe(1);
    });

    it('fetchUnreadCounts should be a no-op in local mode', async () => {
      mockSetupService.getServerUrl.mockReturnValue('');
      await service.fetchUnreadCounts('alice', 'story');
      httpMock.expectNone(() => true);
    });

    it('markSeen should POST and clear local unread count', async () => {
      // Pre-populate unread counts
      const fetchPromise = service.fetchUnreadCounts('alice', 'story');
      const fetchReq = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/unread'
      );
      fetchReq.flush([{ documentId: 'doc-1', count: 5 }]);
      await fetchPromise;

      const markPromise = service.markSeen('alice', 'story', 'doc-1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/seen'
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ documentId: 'doc-1' });
      req.flush({});
      await markPromise;

      expect(service.unreadCounts().has('doc-1')).toBe(false);
    });

    it('fetchUnreadCounts should silently handle HTTP errors', async () => {
      const promise = service.fetchUnreadCounts('alice', 'story');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/unread'
      );
      req.flush('Server Error', { status: 500, statusText: 'Error' });
      await promise;
      // Should not throw — counts remain empty
      expect(service.unreadCounts().size).toBe(0);
    });

    it('markSeen should silently handle HTTP errors', async () => {
      const promise = service.markSeen('alice', 'story', 'doc-1');
      const req = httpMock.expectOne(
        'http://localhost:8333/api/v1/comments/alice/story/seen'
      );
      req.flush('Server Error', { status: 500, statusText: 'Error' });
      await promise;
      // Should not throw
    });

    it('markSeen should be a no-op in local mode', async () => {
      mockSetupService.getServerUrl.mockReturnValue('');
      await service.markSeen('alice', 'story', 'doc-1');
      httpMock.expectNone(() => true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Signals
  // ─────────────────────────────────────────────────────────────────────────

  describe('signals', () => {
    it('should initialise activeCommentId as null', () => {
      expect(service.activeCommentId()).toBeNull();
    });

    it('should initialise commentClickEvent as null', () => {
      expect(service.commentClickEvent()).toBeNull();
    });

    it('should initialise addCommentTrigger as 0', () => {
      expect(service.addCommentTrigger()).toBe(0);
    });

    it('should initialise unreadCounts as empty map', () => {
      expect(service.unreadCounts().size).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // setActiveDocumentId
  // ─────────────────────────────────────────────────────────────────────────

  describe('setActiveDocumentId', () => {
    it('should accept a string id', () => {
      service.setActiveDocumentId('doc-123');
      // Verified indirectly by addComment server mode not returning null for missing doc id
    });

    it('should accept null', () => {
      service.setActiveDocumentId(null);
      // No error expected
    });
  });
});
