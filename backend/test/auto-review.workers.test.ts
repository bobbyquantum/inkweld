/**
 * AutoReviewService on Cloudflare Workers.
 *
 * `yjsService` (LevelDB) cannot run on Workers: opening it there threw
 * `indexedDB is not defined` and crashed every auto-review request. With a
 * `DocumentRuntime` carrying the `YJS_PROJECTS` binding, the service loads the
 * document's state from the project's Durable Object, edits a local copy and
 * sends only its changes back. A fake namespace stands in for the DO here,
 * holding the "server" Y.Doc and answering the two endpoints the service uses.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import type { DatabaseInstance } from '../src/types/context';
import type { DurableObjectNamespace } from '../src/types/cloudflare';

const { yjsService } = await import('../src/services/yjs.service');
const { autoReviewService } = await import('../src/services/auto-review.service');
const { openAILintService } = await import('../src/services/openai-lint.service');
const { projectService } = await import('../src/services/project.service');
const { autoReviewRejectionService } =
  await import('../src/services/auto-review-rejection.service');

const LINT_MARK = 'auto_review';
const DOCUMENT_ID = 'alice:novel:doc-1/';
const fakeDb = {} as DatabaseInstance;

interface FakeDo {
  namespace: DurableObjectNamespace;
  serverDoc: Y.Doc;
  requests: Array<{ method: string; path: string; documentId: string | null; auth: string | null }>;
}

/** A `YJS_PROJECTS` namespace whose single DO serves `serverDoc`. */
function makeFakeDo(serverDoc: Y.Doc): FakeDo {
  const requests: FakeDo['requests'] = [];
  const stub = {
    fetch: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      requests.push({
        method: request.method,
        path: url.pathname,
        documentId: url.searchParams.get('documentId'),
        auth: request.headers.get('Authorization'),
      });
      if (request.method === 'GET' && url.pathname === '/api/document-state') {
        return new Response(Y.encodeStateAsUpdate(serverDoc), { status: 200 });
      }
      if (request.method === 'POST' && url.pathname === '/api/document') {
        const body = (await request.json()) as { yUpdate: string };
        Y.applyUpdate(
          serverDoc,
          Uint8Array.from(atob(body.yUpdate), (c) => c.codePointAt(0) ?? 0)
        );
        return new Response('{}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    },
  };
  const namespace = {
    idFromName: (name: string) => name,
    get: () => stub,
  } as unknown as DurableObjectNamespace;
  return { namespace, serverDoc, requests };
}

function makeDocWithParagraph(text: string): Y.Doc {
  const ydoc = new Y.Doc();
  const para = new Y.XmlElement('paragraph');
  para.insert(0, [new Y.XmlText(text)]);
  ydoc.getXmlFragment('prosemirror').insert(0, [para]);
  return ydoc;
}

function firstText(doc: Y.Doc): Y.XmlText {
  return (doc.getXmlFragment('prosemirror').get(0) as Y.XmlElement).get(0) as Y.XmlText;
}

/** The paragraph's text without mark markup. */
function plainText(doc: Y.Doc): string {
  return (firstText(doc).toDelta() as Array<{ insert: string }>).map((op) => op.insert).join('');
}

function markSuggestion(doc: Y.Doc, id: string, suggestion: string): void {
  firstText(doc).format(0, 4, {
    [LINT_MARK]: {
      id,
      message: 'fix subject',
      suggestion,
      category: 'grammar',
      severity: 'suggestion',
    },
  });
}

function markIds(doc: Y.Doc): string[] {
  return (firstText(doc).toDelta() as Array<{ attributes?: Record<string, { id: string }> }>)
    .map((op) => op.attributes?.[LINT_MARK]?.id)
    .filter((id): id is string => typeof id === 'string');
}

describe('AutoReviewService on Workers', () => {
  let spies: Array<ReturnType<typeof spyOn>> = [];

  beforeEach(() => {
    spies = [
      // The Bun document store must never be touched on Workers.
      spyOn(yjsService, 'getDocument').mockImplementation(() => {
        throw new Error('yjsService used on Workers');
      }),
      spyOn(openAILintService, 'isAiEnabled').mockResolvedValue(true),
      spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
        id: 'project-1',
      } as never),
      spyOn(autoReviewRejectionService, 'getRejections').mockResolvedValue([]),
    ];
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('reviews through the Durable Object and writes the marks back', async () => {
    const fake = makeFakeDo(makeDocWithParagraph('This are a test.'));
    spies.push(
      spyOn(openAILintService, 'processDocument').mockResolvedValue({
        corrections: [
          {
            paragraph_index: 0,
            start_pos: 0,
            end_pos: 4,
            original_text: 'This',
            corrected_text: 'These',
            error_type: 'grammar',
            recommendation: 'Subject-verb agreement',
          },
        ],
        style_recommendations: [],
        source: 'openai',
      } as never)
    );

    const result = await autoReviewService.reviewDocument(
      fakeDb,
      DOCUMENT_ID,
      'general',
      'medium',
      {
        env: { YJS_PROJECTS: fake.namespace },
        authToken: 'token-1',
      }
    );

    expect(result.suggestions).toHaveLength(1);
    expect(markIds(fake.serverDoc)).toEqual([result.suggestions[0].id]);
    expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/document-state',
      'POST /api/document',
    ]);
    expect(fake.requests.every((r) => r.auth === 'Bearer token-1')).toBe(true);
    expect(fake.requests[0].documentId).toBe(DOCUMENT_ID);
  });

  it('keeps an edit made on the server while the review was running', async () => {
    const fake = makeFakeDo(makeDocWithParagraph('This are a test.'));
    spies.push(
      spyOn(openAILintService, 'processDocument').mockImplementation(async () => {
        // A collaborator types while the LLM call is in flight.
        firstText(fake.serverDoc).insert(16, ' More.');
        return {
          corrections: [
            {
              paragraph_index: 0,
              start_pos: 0,
              end_pos: 4,
              original_text: 'This',
              corrected_text: 'These',
              error_type: 'grammar',
              recommendation: 'agreement',
            },
          ],
          style_recommendations: [],
          source: 'openai',
        } as never;
      })
    );

    await autoReviewService.reviewDocument(fakeDb, DOCUMENT_ID, 'general', 'medium', {
      env: { YJS_PROJECTS: fake.namespace },
    });

    expect(plainText(fake.serverDoc)).toBe('This are a test. More.');
    expect(markIds(fake.serverDoc)).toHaveLength(1);
  });

  it('accepts, rejects and clears suggestions on the server copy', async () => {
    const serverDoc = makeDocWithParagraph('This are bad.');
    markSuggestion(serverDoc, 'sug-1', 'These');
    const fake = makeFakeDo(serverDoc);
    const runtime = { env: { YJS_PROJECTS: fake.namespace } };

    const info = await autoReviewService.getSuggestionInfo(DOCUMENT_ID, 'sug-1', runtime);
    expect(info?.originalText).toBe('This');
    // A read sends nothing back.
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(0);

    expect(await autoReviewService.acceptSuggestion(DOCUMENT_ID, 'sug-1', 'These', runtime)).toBe(
      true
    );
    expect(plainText(serverDoc)).toBe('These are bad.');
    expect(markIds(serverDoc)).toEqual([]);

    markSuggestion(serverDoc, 'sug-2', 'Those');
    expect(await autoReviewService.rejectSuggestion(DOCUMENT_ID, 'sug-2', runtime)).toBe(true);
    expect(markIds(serverDoc)).toEqual([]);
    expect(plainText(serverDoc)).toBe('These are bad.');

    markSuggestion(serverDoc, 'sug-3', 'Those');
    expect(await autoReviewService.clearAllMarks(DOCUMENT_ID, runtime)).toBe(1);
    expect(markIds(serverDoc)).toEqual([]);
  });

  it('sends nothing when a reject finds no matching suggestion', async () => {
    const fake = makeFakeDo(makeDocWithParagraph('Fine text.'));
    const runtime = { env: { YJS_PROJECTS: fake.namespace } };

    expect(await autoReviewService.rejectSuggestion(DOCUMENT_ID, 'missing', runtime)).toBe(false);
    expect(fake.requests.map((r) => r.method)).toEqual(['GET']);
  });
});
