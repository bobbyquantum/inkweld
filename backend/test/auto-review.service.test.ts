/**
 * Unit tests for AutoReviewService — server-side lint review via Yjs marks.
 *
 * Bypasses LevelDB by mocking yjsService.getDocument() to return an in-memory
 * Y.Doc. Mocks openAILintService.processDocument() to return deterministic
 * corrections without calling the LLM.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import type { DatabaseInstance } from '../src/types/context';

// Import the service (uses dynamic `await import('yjs')` internally, but
// Bun's module cache returns the same singleton as `import * as Y` above).
const { yjsService } = await import('../src/services/yjs.service');
const { autoReviewService } = await import('../src/services/auto-review.service');
const { openAILintService } = await import('../src/services/openai-lint.service');
const { projectService } = await import('../src/services/project.service');
const { autoReviewRejectionService } =
  await import('../src/services/auto-review-rejection.service');

const LINT_MARK = 'auto_review';

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

/** Build a Y.Doc with a bullet list containing two list items, each with
 *  a paragraph. The LLM should see each list item as a separate paragraph. */
function makeDocWithBulletList(item1Text: string, item2Text: string): Y.Doc {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment('prosemirror');
  const bulletList = new Y.XmlElement('bulletList');
  for (const text of [item1Text, item2Text]) {
    const listItem = new Y.XmlElement('listItem');
    const para = new Y.XmlElement('paragraph');
    const ytext = new Y.XmlText();
    ytext.insert(0, text);
    para.insert(0, [ytext]);
    listItem.insert(0, [para]);
    bulletList.insert(bulletList.length, [listItem]);
  }
  fragment.insert(0, [bulletList]);
  return ydoc;
}

/** Build a Y.Doc with a paragraph containing text + an elementRef chip.
 *  The chip is inserted between `beforeText` and `afterText`. */
function makeDocWithElementRef(
  beforeText: string,
  chipDisplayText: string,
  afterText: string
): Y.Doc {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment('prosemirror');
  const para = new Y.XmlElement('paragraph');

  const before = new Y.XmlText();
  before.insert(0, beforeText);

  const chip = new Y.XmlElement('elementRef');
  chip.setAttribute('elementId', 'char-001');
  chip.setAttribute('elementType', 'character');
  chip.setAttribute('displayText', chipDisplayText);
  chip.setAttribute('originalName', chipDisplayText);

  const after = new Y.XmlText();
  after.insert(0, afterText);

  para.insert(0, [before]);
  para.insert(1, [chip]);
  para.insert(2, [after]);
  fragment.insert(0, [para]);
  return ydoc;
}

/** Read all auto_review marks from a fragment's text nodes. */
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
            // Check both bare key (backend-written) and hashed key
            // (y-prosemirror-written) to fully detect remaining marks.
            const attrs =
              op.attributes?.[LINT_MARK] ??
              Object.entries(op.attributes ?? {}).find(([k]) =>
                k.startsWith(`${LINT_MARK}--`)
              )?.[1];
            if (attrs) {
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

describe('AutoReviewService', () => {
  let getDocumentSpy: ReturnType<typeof spyOn>;
  let processDocSpy: ReturnType<typeof spyOn>;
  let isAiEnabledSpy: ReturnType<typeof spyOn>;
  let findByUsernameSpy: ReturnType<typeof spyOn>;
  let getRejectionsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    isAiEnabledSpy = spyOn(openAILintService, 'isAiEnabled').mockResolvedValue(true);
    findByUsernameSpy = spyOn(projectService, 'findByUsernameAndSlug').mockResolvedValue({
      id: 'test-project-id',
    } as never);
    getRejectionsSpy = spyOn(autoReviewRejectionService, 'getRejections').mockResolvedValue([]);
  });

  afterEach(() => {
    getDocumentSpy?.mockRestore();
    processDocSpy?.mockRestore();
    isAiEnabledSpy.mockRestore();
    findByUsernameSpy.mockRestore();
    getRejectionsSpy.mockRestore();
  });

  describe('reviewDocument', () => {
    it('should apply auto_review marks for each correction', async () => {
      const ydoc = makeDocWithParagraph('This are a test.');
      const fragment = ydoc.getXmlFragment('prosemirror');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      processDocSpy = spyOn(openAILintService, 'processDocument').mockResolvedValue({
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
      } as never);

      const result = await autoReviewService.reviewDocument(
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

      processDocSpy = spyOn(openAILintService, 'processDocument').mockResolvedValue({
        corrections: [],
        style_recommendations: [],
        source: 'openai',
      } as never);

      const result = await autoReviewService.reviewDocument(
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

      // Paragraphs are in reverse insert order: 'Second paragraph.' is
      // paragraph 0, 'First paragraph.' is paragraph 1.
      processDocSpy = spyOn(openAILintService, 'processDocument').mockResolvedValue({
        corrections: [
          {
            paragraph_index: 1,
            start_pos: 0,
            end_pos: 5,
            original_text: 'First',
            corrected_text: 'Firstly',
            error_type: 'style',
            recommendation: 'Better transition',
          },
        ],
        style_recommendations: [],
        source: 'openai',
      } as never);

      const result = await autoReviewService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      expect(processDocSpy).toHaveBeenCalledTimes(1);
      expect(result.suggestions).toHaveLength(1);
    });

    it('should extract bullet list items as separate paragraphs', async () => {
      const ydoc = makeDocWithBulletList('This are item one.', 'Item two is fine.');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      let capturedParagraphs: string[] = [];
      processDocSpy = spyOn(openAILintService, 'processDocument').mockImplementation(
        async (_db: unknown, paragraphs: string[]) => {
          capturedParagraphs = paragraphs;
          return { corrections: [], style_recommendations: [], source: 'openai' } as never;
        }
      );

      await autoReviewService.reviewDocument(fakeDb, 'test:doc', 'general', 'medium');

      // Each list item should be a separate paragraph, not merged.
      expect(capturedParagraphs).toHaveLength(2);
      expect(capturedParagraphs[0]).toBe('This are item one.');
      expect(capturedParagraphs[1]).toBe('Item two is fine.');
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

      processDocSpy = spyOn(openAILintService, 'processDocument').mockResolvedValue({
        corrections: [
          {
            paragraph_index: 0,
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

      const result = await autoReviewService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      expect(result.suggestions).toHaveLength(0);
    });

    it('should include elementRef display text in the paragraph sent to the LLM', async () => {
      // Paragraph: "at [Elara] fights the dragon" where [Elara] is a chip.
      const ydoc = makeDocWithElementRef('at ', 'Elara', ' fights the dragon');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      let capturedParagraphs: string[] = [];
      processDocSpy = spyOn(openAILintService, 'processDocument').mockImplementation(
        async (_db: unknown, paragraphs: string[]) => {
          capturedParagraphs = paragraphs;
          return { corrections: [], style_recommendations: [], source: 'openai' } as never;
        }
      );

      await autoReviewService.reviewDocument(fakeDb, 'test:doc', 'general', 'medium');

      // The LLM should see "at Elara fights the dragon" (with the chip text).
      expect(capturedParagraphs).toHaveLength(1);
      expect(capturedParagraphs[0]).toContain('Elara');
      expect(capturedParagraphs[0]).toBe('at Elara fights the dragon');
    });

    it('should skip corrections that overlap an elementRef chip', async () => {
      // Paragraph: "at [Elara] fights" — the LLM might suggest replacing
      // "Elara" (positions 3-7 in "at Elara fights") but those positions
      // map to an elementRef chip and must be skipped.
      const ydoc = makeDocWithElementRef('at ', 'Elara', ' fights');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      processDocSpy = spyOn(openAILintService, 'processDocument').mockResolvedValue({
        corrections: [
          {
            paragraph_index: 0,
            start_pos: 3,
            end_pos: 8,
            original_text: 'Elara',
            corrected_text: 'the hero',
            error_type: 'grammar',
            recommendation: 'missing character reference',
          },
        ],
        style_recommendations: [],
        source: 'openai',
      } as never);

      const result = await autoReviewService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      // The correction overlaps the chip → skipped, no marks applied.
      expect(result.suggestions).toHaveLength(0);
      const fragment = ydoc.getXmlFragment('prosemirror');
      expect(readLintMarks(fragment)).toHaveLength(0);
    });

    it('should apply marks for corrections that do NOT overlap elementRef chips', async () => {
      // Paragraph: "This are [Elara] fights" — the correction targets
      // "This are" (positions 0-7), which is before the chip.
      const ydoc = makeDocWithElementRef('This are ', 'Elara', ' fights');

      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: ydoc,
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      processDocSpy = spyOn(openAILintService, 'processDocument').mockResolvedValue({
        corrections: [
          {
            paragraph_index: 0,
            start_pos: 0,
            end_pos: 8,
            original_text: 'This are',
            corrected_text: 'This is',
            error_type: 'grammar',
            recommendation: 'Subject-verb agreement',
          },
        ],
        style_recommendations: [],
        source: 'openai',
      } as never);

      const result = await autoReviewService.reviewDocument(
        fakeDb,
        'test:doc',
        'general',
        'medium'
      );

      expect(result.suggestions).toHaveLength(1);
      const fragment = ydoc.getXmlFragment('prosemirror');
      const marks = readLintMarks(fragment);
      expect(marks).toHaveLength(1);
      expect(marks[0].text).toBe('This are');
    });

    it('should throw when AI auto-review is not configured', async () => {
      isAiEnabledSpy.mockResolvedValue(false);
      getDocumentSpy = spyOn(yjsService, 'getDocument').mockResolvedValue({
        name: 'test:doc',
        doc: new Y.Doc(),
        awareness: {} as never,
        conns: new Map(),
        wsUserIds: new Map(),
      });

      await expect(
        autoReviewService.reviewDocument(fakeDb, 'test:doc', 'general', 'medium')
      ).rejects.toThrow('AI auto-review is not configured');
    });
  });

  describe('clearAllMarks', () => {
    it('should remove all auto_review marks', async () => {
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

      const cleared = await autoReviewService.clearAllMarks('test:doc');
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

      const success = await autoReviewService.rejectSuggestion('test:doc', 'sug-1');
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

      const success = await autoReviewService.rejectSuggestion('test:doc', 'nonexistent');
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

      const success = await autoReviewService.acceptSuggestion('test:doc', 'sug-1', 'These');
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

      const success = await autoReviewService.acceptSuggestion(
        'test:doc',
        'nonexistent',
        'replacement'
      );
      expect(success).toBe(false);
    });

    it('should accept a suggestion stored under a y-prosemirror hashed key', async () => {
      // y-prosemirror stores "overlapping" marks (excludes: '') under a
      // hashed key like `auto_review--<base64>` instead of the bare mark
      // name. The backend must find marks under either key.
      const ydoc = makeDocWithParagraph('This are bad.');
      const fragment = ydoc.getXmlFragment('prosemirror');
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      const hashedKey = `${LINT_MARK}--dGVzdGlu`;
      ytext.format(0, 4, {
        [hashedKey]: {
          id: 'sug-hashed',
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

      const success = await autoReviewService.acceptSuggestion('test:doc', 'sug-hashed', 'These');
      expect(success).toBe(true);

      const text = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      expect(text.toString()).toBe('These are bad.');
      expect(readLintMarks(fragment)).toHaveLength(0);
    });
  });

  describe('hashed key handling (y-prosemirror compatibility)', () => {
    it('should clear marks stored under hashed keys', async () => {
      const ydoc = makeDocWithParagraph('This are bad.');
      const fragment = ydoc.getXmlFragment('prosemirror');
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      const hashedKey = `${LINT_MARK}--dGVzdGlu`;
      ytext.format(0, 4, {
        [hashedKey]: {
          id: 'sug-1',
          message: 'fix',
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

      const cleared = await autoReviewService.clearAllMarks('test:doc');
      expect(cleared).toBeGreaterThan(0);
      expect(readLintMarks(fragment)).toHaveLength(0);
    });

    it('should reject (remove) marks stored under hashed keys', async () => {
      const ydoc = makeDocWithParagraph('This are bad.');
      const fragment = ydoc.getXmlFragment('prosemirror');
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      const hashedKey = `${LINT_MARK}--dGVzdGlu`;
      ytext.format(0, 4, {
        [hashedKey]: {
          id: 'sug-reject',
          message: 'fix',
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

      const success = await autoReviewService.rejectSuggestion('test:doc', 'sug-reject');
      expect(success).toBe(true);
      expect(readLintMarks(fragment)).toHaveLength(0);
    });

    it('should read suggestion info from hashed-key marks', async () => {
      const ydoc = makeDocWithParagraph('This are bad.');
      const fragment = ydoc.getXmlFragment('prosemirror');
      const ytext = (fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText;
      const hashedKey = `${LINT_MARK}--dGVzdGlu`;
      ytext.format(0, 4, {
        [hashedKey]: {
          id: 'sug-info',
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

      const info = await autoReviewService.getSuggestionInfo('test:doc', 'sug-info');
      expect(info).not.toBeNull();
      expect(info?.message).toBe('fix subject');
      expect(info?.suggestion).toBe('These');
      expect(info?.category).toBe('grammar');
      expect(info?.originalText).toBe('This');
    });
  });
});
