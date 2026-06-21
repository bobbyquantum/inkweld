/**
 * Unit tests for LintDocumentService — server-side lint review via Yjs marks.
 *
 * Bypasses LevelDB by mocking yjsService.getDocument() to return an in-memory
 * Y.Doc. Mocks openAILintService.processText() to return deterministic
 * corrections without calling the LLM.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import type { DatabaseInstance } from '../src/types/context';

// Import the service (uses dynamic `await import('yjs')` internally, but
// Bun's module cache returns the same singleton as `import * as Y` above).
const { yjsService } = await import('../src/services/yjs.service');
const { lintDocumentService } = await import('../src/services/lint-document.service');
const { openAILintService } = await import('../src/services/openai-lint.service');

const LINT_MARK = 'lint_error';

/** Build a Y.Doc with a prosemirror fragment containing a single paragraph. */
function makeDocWithParagraph(text: string): Y.Doc {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment('prosemirror');
  const para = new Y.XmlElement('paragraph');
  const ytext = new Y.XmlText();
  ytext.insert(0, text);
  para.insert(0, [ytext]);
  fragment.insert(0, [para]);
  return ydoc;
}

function makeDocWithTwoParagraphs(text1: string, text2: string): Y.Doc {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment('prosemirror');
  for (const text of [text1, text2]) {
    const para = new Y.XmlElement('paragraph');
    const ytext = new Y.XmlText();
    ytext.insert(0, text);
    para.insert(0, [ytext]);
    fragment.insert(0, [para]);
  }
  return ydoc;
}

/** Read all lint_error marks from a fragment's text nodes. */
function readLintMarks(fragment: Y.XmlFragment): Array<{
  id: string;
  message: string;
  suggestion: string;
  text: string;
}> {
  const marks: Array<{ id: string; message: string; suggestion: string; text: string }> = [];
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    if (child instanceof Y.XmlElement) {
      for (let j = 0; j < child.length; j++) {
        const grandchild = child.get(j);
        if (grandchild instanceof Y.XmlText) {
          const delta = grandchild.toDelta() as Array<{
            insert: string;
            attributes?: Record<string, Record<string, unknown>>;
          }>;
          for (const op of delta) {
            if (op.attributes?.[LINT_MARK]) {
              const attrs = op.attributes[LINT_MARK];
              marks.push({
                id: attrs.id as string,
                message: attrs.message as string,
                suggestion: attrs.suggestion as string,
                text: op.insert,
              });
            }
          }
        }
      }
    }
  }
  return marks;
}

const fakeDb = {} as DatabaseInstance;

describe('LintDocumentService', () => {
  let getDocumentSpy: ReturnType<typeof spyOn>;
  let processTextSpy: ReturnType<typeof spyOn>;
  let isAiEnabledSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    isAiEnabledSpy = spyOn(openAILintService, 'isAiEnabled').mockResolvedValue(true);
  });

  afterEach(() => {
    getDocumentSpy?.mockRestore();
    processTextSpy?.mockRestore();
    isAiEnabledSpy.mockRestore();
  });

  describe('reviewDocument', () => {
    it('should apply lint_error marks for each correction', async () => {
      const ydoc = makeDocWithParagraph('This are a test.');
      const fragment = ydoc.getXmlFragment('prosemirror');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      processTextSpy = spyOn(openAILintService, 'processText').mockResolvedValue({
        original_paragraph: 'This are a test.',
        corrections: [
          {
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
      } as never);

      const result = await lintDocumentService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      expect(result.suggestions).toHaveLength(1);
      expect(result.clearedMarks).toBe(0);

      const marks = readLintMarks(fragment);
      expect(marks).toHaveLength(1);
      expect(marks[0].text).toBe('This');
      expect(marks[0].suggestion).toBe('These');
      expect(marks[0].message).toBe('Subject-verb agreement');
    });

    it('should clear existing lint marks before applying new ones', async () => {
      const ydoc = makeDocWithParagraph('This are a test.');
      const fragment = ydoc.getXmlFragment('prosemirror');

      // Pre-apply a lint mark manually
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      ytext.format(0, 4, {
        [LINT_MARK]: {
          id: 'old-1',
          message: 'old',
          suggestion: 'new',
          category: 'grammar',
          severity: 'suggestion',
        },
      });

      // Verify mark exists
      expect(readLintMarks(fragment)).toHaveLength(1);

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      processTextSpy = spyOn(openAILintService, 'processText').mockResolvedValue({
        original_paragraph: 'This are a test.',
        corrections: [],
        style_recommendations: [],
        source: 'openai',
      } as never);

      const result = await lintDocumentService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      expect(result.suggestions).toHaveLength(0);
      expect(result.clearedMarks).toBe(1);
      expect(readLintMarks(fragment)).toHaveLength(0);
    });

    it('should handle multiple paragraphs', async () => {
      const ydoc = makeDocWithTwoParagraphs('First paragraph.', 'Second paragraph.');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      let callCount = 0;
      processTextSpy = spyOn(openAILintService, 'processText').mockImplementation(
        async () => {
          callCount++;
          // Paragraphs are in reverse insert order: 'Second paragraph.' is
          // paragraph 0, 'First paragraph.' is paragraph 1.
          const text = callCount === 1 ? 'Second paragraph.' : 'First paragraph.';
          return {
            original_paragraph: text,
            corrections:
              callCount === 2
                ? [
                    {
                      start_pos: 0,
                      end_pos: 5,
                      original_text: 'First',
                      corrected_text: 'Firstly',
                      error_type: 'style',
                      recommendation: 'Better transition',
                    },
                  ]
                : [],
            style_recommendations: [],
            source: 'openai',
          } as never;
        }
      );

      const result = await lintDocumentService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      expect(processTextSpy).toHaveBeenCalledTimes(2);
      expect(result.suggestions).toHaveLength(1);
    });

    it('should skip corrections with unmatchable original_text', async () => {
      const ydoc = makeDocWithParagraph('Hello world.');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      processTextSpy = spyOn(openAILintService, 'processText').mockResolvedValue({
        original_paragraph: 'Hello world.',
        corrections: [
          {
            start_pos: 0,
            end_pos: 5,
            original_text: 'NONEXISTENT',
            corrected_text: 'something',
            error_type: 'grammar',
            recommendation: 'fix',
          },
        ],
        style_recommendations: [],
        source: 'openai',
      } as never);

      const result = await lintDocumentService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      expect(result.suggestions).toHaveLength(0);
    });

    it('should throw when AI linting is not configured', async () => {
      isAiEnabledSpy.mockResolvedValue(false);
      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: new Y.Doc(),
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      await expect(
        lintDocumentService.reviewDocument(fakeDb, 'test:doc', 'general', 'medium')
      ).rejects.toThrow('AI linting is not configured');
    });
  });

  describe('clearAllMarks', () => {
    it('should remove all lint_error marks', async () => {
      const ydoc = makeDocWithParagraph('Test text here.');
      const fragment = ydoc.getXmlFragment('prosemirror');
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      ytext.format(0, 4, {
        [LINT_MARK]: {
          id: 'm1',
          message: 'msg',
          suggestion: 'sug',
          category: 'grammar',
          severity: 'suggestion',
        },
      });

      expect(readLintMarks(fragment)).toHaveLength(1);

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      const cleared = await lintDocumentService.clearAllMarks('test:doc');
      expect(cleared).toBe(1);
      expect(readLintMarks(fragment)).toHaveLength(0);
    });
  });

  describe('rejectSuggestion', () => {
    it('should remove the mark with matching id', async () => {
      const ydoc = makeDocWithParagraph('Test text.');
      const fragment = ydoc.getXmlFragment('prosemirror');
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      ytext.format(0, 4, {
        [LINT_MARK]: {
          id: 'sug-1',
          message: 'msg',
          suggestion: 'Tested',
          category: 'grammar',
          severity: 'suggestion',
        },
      });

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      const success = await lintDocumentService.rejectSuggestion('test:doc', 'sug-1');
      expect(success).toBe(true);
      expect(readLintMarks(fragment)).toHaveLength(0);
    });

    it('should return false when suggestion id not found', async () => {
      const ydoc = makeDocWithParagraph('Test text.');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      const success = await lintDocumentService.rejectSuggestion('test:doc', 'nonexistent');
      expect(success).toBe(false);
    });
  });

  describe('acceptSuggestion', () => {
    it('should replace the marked text and remove the mark', async () => {
      const ydoc = makeDocWithParagraph('This are bad.');
      const fragment = ydoc.getXmlFragment('prosemirror');
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      ytext.format(0, 4, {
        [LINT_MARK]: {
          id: 'sug-1',
          message: 'fix subject',
          suggestion: 'These',
          category: 'grammar',
          severity: 'suggestion',
        },
      });

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      const success = await lintDocumentService.acceptSuggestion(
        'test:doc',
        'sug-1',
        'These'
      );
      expect(success).toBe(true);

      // Check that the text was replaced
      const text = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      expect(text.toString()).toBe('These are bad.');
      // Mark should be gone
      expect(readLintMarks(fragment)).toHaveLength(0);
    });

    it('should return false when suggestion id not found', async () => {
      const ydoc = makeDocWithParagraph('Test text.');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      const success = await lintDocumentService.acceptSuggestion(
        'test:doc',
        'nonexistent',
        'replacement'
      );
      expect(success).toBe(false);
    });
  });
});