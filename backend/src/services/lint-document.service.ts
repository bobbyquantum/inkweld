/**
 * Server-side lint review service.
 *
 * Loads a Yjs document, extracts paragraph text with position mapping,
 * calls the OpenAI-compatible LLM for corrections, and surgically
 * applies `lint_error` marks back onto the Y.XmlText nodes via
 * `Y.XmlText.format()`. Because mutations happen on the live Y.Doc,
 * the existing `doc.on('update')` listener auto-broadcasts to all
 * connected clients — no extra sync code needed.
 *
 * Re-running a review clears all existing `lint_error` marks first.
 */

import type * as YModule from 'yjs';
import { openAILintService } from './openai-lint.service';
import { yjsService } from './yjs.service';
import { logger } from './logger.service';
import type { DatabaseInstance } from '../types/context';

/** ProseMirror/Yjs mark name for lint errors — must match `LINT_ERROR_MARK_NAME` in @inkweld/prosemirror/schema. */
const LINT_ERROR_MARK_NAME = 'lint_error';

const lintDocLog = logger.child('LintDoc');

export interface LintSuggestion {
  id: string;
  message: string;
  suggestion: string;
  category: string;
  severity: 'error' | 'warning' | 'suggestion';
  /** Start offset within the paragraph text. */
  paragraphStart: number;
  /** End offset within the paragraph text. */
  paragraphEnd: number;
  originalText: string;
}

export interface LintReviewResult {
  suggestions: LintSuggestion[];
  /** Number of existing marks that were cleared. */
  clearedMarks: number;
}

interface ParagraphInfo {
  /** Flat text of the paragraph for LLM input. */
  text: string;
  /**
   * Map from flat-text character offset → `{ textNode, localOffset }`
   * within the Y.XmlFragment. Lets us translate LLM char positions back
   * to Y.XmlText.format() offsets.
   */
  offsetMap: Array<{
    textNode: YModule.XmlText;
    /** Offset within this XmlText. */
    offset: number;
  }>;
}

interface DeltaOp {
  insert: string;
  attributes?: Record<string, Record<string, unknown>>;
}

/**
 * Walk a Y.XmlFragment, collecting leaf text runs grouped by paragraph
 * (top-level block). Returns text + a position map per paragraph.
 */
function extractParagraphs(Y: typeof YModule, fragment: YModule.XmlFragment): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];

  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    if (child instanceof Y.XmlElement) {
      const info = collectParagraphFromElement(Y, child);
      if (info) paragraphs.push(info);
    } else if (child instanceof Y.XmlText) {
      const info = collectParagraphFromText(Y, [child]);
      if (info) paragraphs.push(info);
    }
  }

  return paragraphs;
}

function collectParagraphFromElement(
  Y: typeof YModule,
  element: YModule.XmlElement
): ParagraphInfo | null {
  // A paragraph/heading/etc. — collect all descendant XmlText nodes.
  const textNodes: YModule.XmlText[] = [];
  collectTextNodes(Y, element, textNodes);
  if (textNodes.length === 0) return null;
  return collectParagraphFromText(Y, textNodes);
}

function collectTextNodes(
  Y: typeof YModule,
  element: YModule.XmlElement,
  out: YModule.XmlText[]
): void {
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i);
    if (child instanceof Y.XmlText) {
      out.push(child);
    } else if (child instanceof Y.XmlElement) {
      collectTextNodes(Y, child, out);
    }
  }
}

function collectParagraphFromText(
  _Y: typeof YModule,
  textNodes: YModule.XmlText[]
): ParagraphInfo | null {
  let text = '';
  const offsetMap: ParagraphInfo['offsetMap'] = [];

  for (const textNode of textNodes) {
    const delta = textNode.toDelta() as DeltaOp[];
    for (const op of delta) {
      if (!op.insert) continue;
      for (let i = 0; i < op.insert.length; i++) {
        offsetMap.push({ textNode, offset: i + getTextLengthBefore(delta, op) });
      }
      text += op.insert;
    }
  }

  if (!text.trim()) return null;
  return { text, offsetMap };
}

/** Get cumulative text length in delta before the given op. */
function getTextLengthBefore(delta: DeltaOp[], targetOp: DeltaOp): number {
  let len = 0;
  for (const op of delta) {
    if (op === targetOp) break;
    len += op.insert?.length ?? 0;
  }
  return len;
}

/**
 * Remove all `lint_error` marks from every XmlText in the fragment.
 * Returns the count of marks removed (approximate — based on delta scan).
 */
function clearLintMarks(Y: typeof YModule, fragment: YModule.XmlFragment): number {
  let cleared = 0;
  const visited = new Set<YModule.XmlText>();

  const walk = (node: YModule.XmlElement | YModule.XmlFragment) => {
    for (let i = 0; i < node.length; i++) {
      const child = node.get(i);
      if (child instanceof Y.XmlText) {
        if (visited.has(child)) continue;
        visited.add(child);
        cleared += clearMarksFromText(Y, child);
      } else if (child instanceof Y.XmlElement) {
        walk(child);
      }
    }
  };
  walk(fragment);
  return cleared;
}

function clearMarksFromText(Y: typeof YModule, text: YModule.XmlText): number {
  const delta = text.toDelta() as DeltaOp[];
  let cleared = 0;
  let offset = 0;

  for (const op of delta) {
    const len = op.insert?.length ?? 0;
    if (op.attributes?.[LINT_ERROR_MARK_NAME]) {
      // Remove the mark from this run.
      text.format(offset, len, { [LINT_ERROR_MARK_NAME]: null });
      cleared++;
    }
    offset += len;
  }
  return cleared;
}

/**
 * Apply a single suggestion as a `lint_error` mark on the Y.XmlText.
 * Uses `format()` to surgically add the mark without disturbing
 * surrounding text or CRDT object identity.
 */
function applySuggestionMark(
  Y: typeof YModule,
  paragraph: ParagraphInfo,
  suggestion: LintSuggestion
): boolean {
  const start = suggestion.paragraphStart;
  const end = suggestion.paragraphEnd;
  if (start < 0 || end > paragraph.offsetMap.length || start >= end) return false;

  // Find the XmlText + local offset for start and end.
  const startEntry = paragraph.offsetMap[start];
  const endEntry = paragraph.offsetMap[end - 1];

  if (!startEntry || !endEntry) return false;

  const markAttrs = {
    id: suggestion.id,
    message: suggestion.message,
    suggestion: suggestion.suggestion,
    category: suggestion.category,
    severity: suggestion.severity,
  };

  if (startEntry.textNode === endEntry.textNode) {
    // Single XmlText — one format call.
    const length = endEntry.offset - startEntry.offset + 1;
    startEntry.textNode.format(startEntry.offset, length, {
      [LINT_ERROR_MARK_NAME]: markAttrs,
    });
    return true;
  }

  // Spans multiple XmlText nodes — format each segment.
  // Group by textNode.
  let currentText: YModule.XmlText | null = null;
  let currentStart = 0;
  let currentEnd = 0;

  for (let i = start; i < end; i++) {
    const entry = paragraph.offsetMap[i];
    if (entry.textNode !== currentText) {
      if (currentText) {
        currentText.format(currentStart, currentEnd - currentStart + 1, {
          [LINT_ERROR_MARK_NAME]: markAttrs,
        });
      }
      currentText = entry.textNode;
      currentStart = entry.offset;
      currentEnd = entry.offset;
    } else {
      currentEnd = entry.offset;
    }
  }
  if (currentText) {
    currentText.format(currentStart, currentEnd - currentStart + 1, {
      [LINT_ERROR_MARK_NAME]: markAttrs,
    });
  }
  return true;
}

export class LintDocumentService {
  /**
   * Run a lint review on a document: clear existing lint marks,
   * call the LLM per paragraph, apply new marks.
   */
  async reviewDocument(
    db: DatabaseInstance,
    documentId: string,
    style: string,
    level: string
  ): Promise<LintReviewResult> {
    const Y = await import('yjs');

    if (!(await openAILintService.isAiEnabled(db))) {
      throw new Error('AI linting is not configured');
    }

    const sharedDoc = await yjsService.getDocument(documentId);
    const fragment = sharedDoc.doc.getXmlFragment('prosemirror');

    // Extract paragraphs before mutation.
    const paragraphs = extractParagraphs(Y, fragment);
    lintDocLog.info(`Reviewing ${paragraphs.length} paragraphs for ${documentId}`);

    // Collect all suggestions first (don't mutate while reading).
    const allSuggestions: LintSuggestion[] = [];

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const para = paragraphs[pIdx];
      if (!para.text.trim()) continue;

      try {
        const result = await openAILintService.processText(db, para.text, style, level);
        for (const correction of result.corrections) {
          // Use original_text to locate within the paragraph as a fallback
          // when start_pos/end_pos don't match (LLMs are unreliable on
          // exact offsets).
          let start = correction.start_pos;
          let end = correction.end_pos;

          // Validate / fix offsets via substring match.
          if (
            start < 0 ||
            end > para.text.length ||
            start >= end ||
            para.text.substring(start, end) !== correction.original_text
          ) {
            // Try to find original_text as a substring.
            const found = para.text.indexOf(correction.original_text);
            if (found >= 0) {
              start = found;
              end = found + correction.original_text.length;
            } else {
              // Skip — can't safely place the mark.
              continue;
            }
          }

          allSuggestions.push({
            id: `${pIdx}-${start}-${crypto.randomUUID()}`,
            message: correction.recommendation,
            suggestion: correction.corrected_text,
            category: correction.error_type,
            severity: 'suggestion',
            paragraphStart: start,
            paragraphEnd: end,
            originalText: correction.original_text,
          });
        }
      } catch (err) {
        lintDocLog.warn(`Failed to lint paragraph ${pIdx}: ${err}`);
      }
    }

    // Now mutate: clear old marks + apply new ones in a single transaction.
    let cleared = 0;
    let applied = 0;

    sharedDoc.doc.transact(() => {
      cleared = clearLintMarks(Y, fragment);
      for (const suggestion of allSuggestions) {
        const para = paragraphs[Number(suggestion.id.split('-')[0])];
        if (para && applySuggestionMark(Y, para, suggestion)) {
          applied++;
        }
      }
    });

    lintDocLog.info(
      `Review complete: ${applied}/${allSuggestions.length} marks applied, ${cleared} cleared`
    );

    return {
      suggestions: allSuggestions,
      clearedMarks: cleared,
    };
  }

  /**
   * Clear all lint_error marks from a document (used by "dismiss all").
   */
  async clearAllMarks(documentId: string): Promise<number> {
    const Y = await import('yjs');
    const sharedDoc = await yjsService.getDocument(documentId);
    const fragment = sharedDoc.doc.getXmlFragment('prosemirror');

    let cleared = 0;
    sharedDoc.doc.transact(() => {
      cleared = clearLintMarks(Y, fragment);
    });
    return cleared;
  }

  /**
   * Accept a suggestion: replace the marked text with the suggestion
   * and remove the mark.
   */
  async acceptSuggestion(
    documentId: string,
    suggestionId: string,
    replacement: string
  ): Promise<boolean> {
    const Y = await import('yjs');
    const sharedDoc = await yjsService.getDocument(documentId);
    const fragment = sharedDoc.doc.getXmlFragment('prosemirror');

    let success = false;
    sharedDoc.doc.transact(() => {
      success = this.findAndReplaceMark(Y, fragment, suggestionId, replacement);
    });
    return success;
  }

  /**
   * Reject a suggestion: remove just this lint_error mark (keep text).
   */
  async rejectSuggestion(documentId: string, suggestionId: string): Promise<boolean> {
    const Y = await import('yjs');
    const sharedDoc = await yjsService.getDocument(documentId);
    const fragment = sharedDoc.doc.getXmlFragment('prosemirror');

    let success = false;
    sharedDoc.doc.transact(() => {
      success = this.findAndRemoveMark(Y, fragment, suggestionId);
    });
    return success;
  }

  /**
   * Walk the fragment, find the lint_error mark with matching id,
   * replace its text content with `replacement` and strip the mark.
   */
  private findAndReplaceMark(
    Y: typeof YModule,
    fragment: YModule.XmlFragment,
    suggestionId: string,
    replacement: string
  ): boolean {
    const visited = new Set<YModule.XmlText>();

    const walk = (node: YModule.XmlElement | YModule.XmlFragment): boolean => {
      for (let i = 0; i < node.length; i++) {
        const child = node.get(i);
        if (child instanceof Y.XmlText) {
          if (visited.has(child)) continue;
          visited.add(child);
          if (replaceInText(Y, child, suggestionId, replacement)) return true;
        } else if (child instanceof Y.XmlElement) {
          if (walk(child)) return true;
        }
      }
      return false;
    };

    return walk(fragment);
  }

  private findAndRemoveMark(
    Y: typeof YModule,
    fragment: YModule.XmlFragment,
    suggestionId: string
  ): boolean {
    const visited = new Set<YModule.XmlText>();

    const walk = (node: YModule.XmlElement | YModule.XmlFragment): boolean => {
      for (let i = 0; i < node.length; i++) {
        const child = node.get(i);
        if (child instanceof Y.XmlText) {
          if (visited.has(child)) continue;
          visited.add(child);
          if (removeFromText(Y, child, suggestionId)) return true;
        } else if (child instanceof Y.XmlElement) {
          if (walk(child)) return true;
        }
      }
      return false;
    };

    return walk(fragment);
  }
}

/**
 * Replace the text covered by a lint_error mark with the given id and
 * remove the mark. Returns true if the mark was found and replaced.
 */
function replaceInText(
  _Y: typeof YModule,
  text: YModule.XmlText,
  suggestionId: string,
  replacement: string
): boolean {
  const delta = text.toDelta() as DeltaOp[];
  let offset = 0;

  for (const op of delta) {
    const len = op.insert?.length ?? 0;
    const lintMark = op.attributes?.[LINT_ERROR_MARK_NAME];
    if (lintMark && lintMark.id === suggestionId) {
      // Replace text in this run.
      text.delete(offset, len);
      if (replacement) {
        text.insert(offset, replacement, {
          ...op.attributes,
          [LINT_ERROR_MARK_NAME]: null,
        });
      } else {
        text.format(offset, 0, { [LINT_ERROR_MARK_NAME]: null });
      }
      return true;
    }
    offset += len;
  }
  return false;
}

/** Remove a lint_error mark with the given id from a single XmlText. */
function removeFromText(_Y: typeof YModule, text: YModule.XmlText, suggestionId: string): boolean {
  const delta = text.toDelta() as DeltaOp[];
  let offset = 0;

  for (const op of delta) {
    const len = op.insert?.length ?? 0;
    const lintMark = op.attributes?.[LINT_ERROR_MARK_NAME];
    if (lintMark && lintMark.id === suggestionId) {
      text.format(offset, len, { [LINT_ERROR_MARK_NAME]: null });
      return true;
    }
    offset += len;
  }
  return false;
}

export const lintDocumentService = new LintDocumentService();
