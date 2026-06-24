/**
 * Server-side auto-review service.
 *
 * Loads a Yjs document, extracts paragraph text with position mapping,
 * calls the OpenAI-compatible LLM for corrections, and surgically
 * applies `auto_review` marks back onto the Y.XmlText nodes via
 * `Y.XmlText.format()`. Because mutations happen on the live Y.Doc,
 * the existing `doc.on('update')` listener auto-broadcasts to all
 * connected clients — no extra sync code needed.
 *
 * Re-running a review clears all existing `auto_review` marks first.
 */

import type * as YModule from 'yjs';
import { openAILintService } from './openai-lint.service';
import { yjsService } from './yjs.service';
import { logger } from './logger.service';
import { autoReviewRejectionService, type RejectionContext } from './auto-review-rejection.service';
import { projectService } from './project.service';
import type { DatabaseInstance } from '../types/context';

/** ProseMirror/Yjs mark name for lint errors — must match `AUTO_REVIEW_MARK_NAME` in @inkweld/prosemirror/schema. */
const AUTO_REVIEW_MARK_NAME = 'auto_review';

const autoReviewLog = logger.child('AutoReviewDoc');

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
 * Remove all `auto_review` marks from every XmlText in the fragment.
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
    if (op.attributes?.[AUTO_REVIEW_MARK_NAME]) {
      // Remove the mark from this run.
      text.format(offset, len, { [AUTO_REVIEW_MARK_NAME]: null });
      cleared++;
    }
    offset += len;
  }
  return cleared;
}

/**
 * Apply a single suggestion as a `auto_review` mark on the Y.XmlText.
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
      [AUTO_REVIEW_MARK_NAME]: markAttrs,
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
          [AUTO_REVIEW_MARK_NAME]: markAttrs,
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
      [AUTO_REVIEW_MARK_NAME]: markAttrs,
    });
  }
  return true;
}

export interface ElementRefInfo {
  elementId: string;
  elementType: string;
  displayText: string;
  originalName: string;
}

/**
 * Walk a Y.XmlFragment collecting all elementRef nodes (inline references
 * to characters, locations, worldbuilding entries, etc.). These are passed
 * to the LLM as context so it doesn't flag proper nouns as errors and can
 * check consistency with referenced elements.
 */
function extractElementRefs(Y: typeof YModule, fragment: YModule.XmlFragment): ElementRefInfo[] {
  const refs: ElementRefInfo[] = [];
  const walk = (node: YModule.XmlElement | YModule.XmlFragment) => {
    for (let i = 0; i < node.length; i++) {
      const child = node.get(i);
      if (child instanceof Y.XmlElement) {
        if (child.nodeName === 'elementRef') {
          const attrs = child.getAttributes();
          refs.push({
            elementId: String(attrs.elementId ?? ''),
            elementType: String(attrs.elementType ?? ''),
            displayText: String(attrs.displayText ?? ''),
            originalName: String(attrs.originalName ?? ''),
          });
        }
        walk(child);
      }
    }
  };
  walk(fragment);
  return refs;
}

export class AutoReviewService {
  /**
   * Run a auto-review on a document: clear existing auto-review marks,
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
      throw new Error('AI auto-review is not configured');
    }

    const sharedDoc = await yjsService.getDocument(documentId);
    const fragment = sharedDoc.doc.getXmlFragment('prosemirror');

    // Extract paragraphs before mutation.
    const paragraphs = extractParagraphs(Y, fragment);
    autoReviewLog.info(`Reviewing ${paragraphs.length} paragraphs for ${documentId}`);

    // Extract element references for LLM context (characters, locations, etc.)
    const elementRefs = extractElementRefs(Y, fragment);

    // Fetch previously rejected suggestions for this document so the LLM
    // doesn't repeat them.
    const parts = documentId.split(':');
    const [username, projectSlug] = parts;
    const bareElementId = parts[2]?.replace(/\/$/, '') ?? '';
    const project = await projectService.findByUsernameAndSlug(db, username, projectSlug);
    let rejections: RejectionContext[] = [];
    if (project) {
      rejections = await autoReviewRejectionService.getRejections(db, project.id, bareElementId);
      if (rejections.length > 0) {
        autoReviewLog.info(`Found ${rejections.length} prior rejections for ${documentId}`);
      }
    }

    // Single LLM call with the full document for coherent context.
    const allSuggestions: LintSuggestion[] = [];

    try {
      const result = await openAILintService.processDocument(
        db,
        paragraphs.map((p) => p.text),
        style,
        level,
        { rejections, elementRefs }
      );

      for (const correction of result.corrections) {
        const pIdx = correction.paragraph_index;
        const para = paragraphs[pIdx];
        if (!para || !para.text.trim()) continue;

        let start = correction.start_pos;
        let end = correction.end_pos;

        // Validate / fix offsets via substring match.
        if (
          start < 0 ||
          end > para.text.length ||
          start >= end ||
          para.text.substring(start, end) !== correction.original_text
        ) {
          const found = para.text.indexOf(correction.original_text);
          if (found >= 0) {
            start = found;
            end = found + correction.original_text.length;
          } else {
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
      autoReviewLog.warn(`Failed to review document: ${err}`);
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

    autoReviewLog.info(
      `Review complete: ${applied}/${allSuggestions.length} marks applied, ${cleared} cleared`
    );

    return {
      suggestions: allSuggestions,
      clearedMarks: cleared,
    };
  }

  /**
   * Clear all auto_review marks from a document (used by "dismiss all").
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
   * Reject a suggestion: remove just this auto_review mark (keep text).
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
   * Read the mark attrs + covered text for a suggestion by ID. Used by the
   * reject route to store the rejection with full metadata.
   */
  async getSuggestionInfo(
    documentId: string,
    suggestionId: string
  ): Promise<{
    message: string;
    suggestion: string;
    category: string;
    originalText: string;
  } | null> {
    const Y = await import('yjs');
    const sharedDoc = await yjsService.getDocument(documentId);
    const fragment = sharedDoc.doc.getXmlFragment('prosemirror');
    return this.findMarkInfo(Y, fragment, suggestionId);
  }

  /**
   * Walk the fragment, find the auto_review mark with matching id, and
   * return its attrs + the covered text.
   */
  private findMarkInfo(
    Y: typeof YModule,
    fragment: YModule.XmlFragment,
    suggestionId: string
  ): {
    message: string;
    suggestion: string;
    category: string;
    originalText: string;
  } | null {
    const visited = new Set<YModule.XmlText>();
    const walk = (
      node: YModule.XmlElement | YModule.XmlFragment
    ): { message: string; suggestion: string; category: string; originalText: string } | null => {
      for (let i = 0; i < node.length; i++) {
        const child = node.get(i);
        if (child instanceof Y.XmlText) {
          if (visited.has(child)) continue;
          visited.add(child);
          const info = readMarkInfoFromText(child, suggestionId);
          if (info) return info;
        } else if (child instanceof Y.XmlElement) {
          const info = walk(child);
          if (info) return info;
        }
      }
      return null;
    };
    return walk(fragment);
  }

  /**
   * Walk the fragment, find the auto_review mark with matching id,
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
 * Replace the text covered by a auto_review mark with the given id and
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
    const lintMark = op.attributes?.[AUTO_REVIEW_MARK_NAME];
    if (lintMark && lintMark.id === suggestionId) {
      // Replace text in this run.
      text.delete(offset, len);
      if (replacement) {
        text.insert(offset, replacement, {
          ...op.attributes,
          [AUTO_REVIEW_MARK_NAME]: null,
        });
      } else {
        text.format(offset, 0, { [AUTO_REVIEW_MARK_NAME]: null });
      }
      return true;
    }
    offset += len;
  }
  return false;
}

/** Remove a auto_review mark with the given id from a single XmlText. */
function removeFromText(_Y: typeof YModule, text: YModule.XmlText, suggestionId: string): boolean {
  const delta = text.toDelta() as DeltaOp[];
  let offset = 0;

  for (const op of delta) {
    const len = op.insert?.length ?? 0;
    const lintMark = op.attributes?.[AUTO_REVIEW_MARK_NAME];
    if (lintMark && lintMark.id === suggestionId) {
      text.format(offset, len, { [AUTO_REVIEW_MARK_NAME]: null });
      return true;
    }
    offset += len;
  }
  return false;
}

/** Read mark attrs + covered text for a suggestion by ID (no mutation). */
function readMarkInfoFromText(
  text: YModule.XmlText,
  suggestionId: string
): { message: string; suggestion: string; category: string; originalText: string } | null {
  const delta = text.toDelta() as DeltaOp[];
  for (const op of delta) {
    const lintMark = op.attributes?.[AUTO_REVIEW_MARK_NAME];
    if (lintMark && lintMark.id === suggestionId) {
      return {
        message: String(lintMark.message ?? ''),
        suggestion: String(lintMark.suggestion ?? ''),
        category: String(lintMark.category ?? ''),
        originalText: op.insert ?? '',
      };
    }
  }
  return null;
}

export const autoReviewService = new AutoReviewService();
