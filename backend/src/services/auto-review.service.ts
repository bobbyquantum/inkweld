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
  /** Flat text of the paragraph for LLM input (includes elementRef display text). */
  text: string;
  /**
   * Map from flat-text character offset → either a `{ textNode, offset }`
   * (markable: a character inside a Y.XmlText) or `{ elementRef: true }`
   * (non-markable: a character inside an elementRef chip's display text).
   * Lets us translate LLM char positions back to Y.XmlText.format() offsets
   * while skipping suggestions that overlap elementRef chips.
   */
  offsetMap: Array<
    { textNode: YModule.XmlText; offset: number; elementRef?: false } | { elementRef: true }
  >;
}

interface DeltaOp {
  insert: string;
  attributes?: Record<string, Record<string, unknown>>;
}

/**
 * y-prosemirror stores "overlapping" marks (marks whose `excludes` spec is
 * `''`, like `auto_review`) under a hashed attribute key
 * `auto_review--<8charhash>` instead of the bare mark name. Marks written
 * directly by the backend via `Y.XmlText.format()` use the bare key
 * `auto_review`. This helper finds the mark attrs under either key so
 * lookups work regardless of who wrote the mark.
 *
 * @returns the mark attrs object, or `undefined` if no auto_review mark
 *          is present on this delta op.
 */
function getAutoReviewMarkAttrs(op: DeltaOp): Record<string, unknown> | undefined {
  const attrs = op.attributes;
  if (!attrs) return undefined;
  // Bare key (backend-written).
  if (attrs[AUTO_REVIEW_MARK_NAME]) {
    return attrs[AUTO_REVIEW_MARK_NAME];
  }
  // Hashed key (y-prosemirror-written): auto_review--<8chars>
  for (const key of Object.keys(attrs)) {
    if (key.startsWith(`${AUTO_REVIEW_MARK_NAME}--`)) {
      return attrs[key];
    }
  }
  return undefined;
}

/** Same as getAutoReviewMarkAttrs but also returns the attribute key, so
 *  callers that need to remove the mark know which key to null out. */
function getAutoReviewMarkKeyAndAttrs(
  op: DeltaOp
): { key: string; attrs: Record<string, unknown> } | undefined {
  const attrs = op.attributes;
  if (!attrs) return undefined;
  if (attrs[AUTO_REVIEW_MARK_NAME]) {
    return { key: AUTO_REVIEW_MARK_NAME, attrs: attrs[AUTO_REVIEW_MARK_NAME] };
  }
  for (const key of Object.keys(attrs)) {
    if (key.startsWith(`${AUTO_REVIEW_MARK_NAME}--`)) {
      return { key, attrs: attrs[key] };
    }
  }
  return undefined;
}

/**
 * Walk a Y.XmlFragment, collecting leaf text runs grouped by paragraph
 * (top-level block). Returns text + a position map per paragraph.
 */
/** Block-level node names that should each be treated as a separate
 *  paragraph for review purposes. Everything else (bulletList, listItem,
 *  blockquote, etc.) is a container — we recurse into it. */
const BLOCK_PARAGRAPH_NODES = new Set(['paragraph', 'heading', 'codeBlock']);

function extractParagraphs(Y: typeof YModule, fragment: YModule.XmlFragment): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  walkBlockNodes(Y, fragment, paragraphs);
  return paragraphs;
}

/** Walk the fragment recursively. Block-paragraph nodes produce a
 *  ParagraphInfo; container nodes (bulletList, listItem, blockquote,
 *  doc, etc.) are recursed into. */
function walkBlockNodes(
  Y: typeof YModule,
  node: YModule.XmlElement | YModule.XmlFragment,
  out: ParagraphInfo[]
): void {
  for (let i = 0; i < node.length; i++) {
    const child = node.get(i);
    if (child instanceof Y.XmlText) {
      // Bare text at this level — treat as a paragraph.
      const info = collectParagraphFromSegments(Y, [{ type: 'text', node: child }]);
      if (info) out.push(info);
    } else if (child instanceof Y.XmlElement) {
      if (BLOCK_PARAGRAPH_NODES.has(child.nodeName)) {
        // A paragraph/heading/codeBlock — collect its inline content.
        const info = collectParagraphFromElement(Y, child);
        if (info) out.push(info);
      } else {
        // Container (bulletList, listItem, blockquote, etc.) — recurse.
        walkBlockNodes(Y, child, out);
      }
    }
  }
}

function collectParagraphFromElement(
  Y: typeof YModule,
  element: YModule.XmlElement
): ParagraphInfo | null {
  // A paragraph/heading/etc. — collect all descendant inline content in
  // document order, including elementRef chip display text.
  const segments: Array<
    { type: 'text'; node: YModule.XmlText } | { type: 'elementRef'; displayText: string }
  > = [];
  collectInlineContent(Y, element, segments);
  if (segments.length === 0) return null;
  return collectParagraphFromSegments(Y, segments);
}

/** Inline element names that we recurse into to collect text.
 *  Block-level elements (paragraph, heading, bulletList, etc.) are
 *  NOT in this set — they're handled by walkBlockNodes. */
const INLINE_NODES = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'link',
  'subscript',
  'superscript',
  'inlineCode',
  'elementRef',
]);

function collectInlineContent(
  Y: typeof YModule,
  element: YModule.XmlElement,
  segments: Array<
    { type: 'text'; node: YModule.XmlText } | { type: 'elementRef'; displayText: string }
  >
): void {
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i);
    if (child instanceof Y.XmlText) {
      segments.push({ type: 'text', node: child });
    } else if (child instanceof Y.XmlElement) {
      if (child.nodeName === 'elementRef') {
        const attrs = child.getAttributes();
        segments.push({
          type: 'elementRef',
          displayText: String(attrs.displayText ?? ''),
        });
      } else if (INLINE_NODES.has(child.nodeName)) {
        // Recurse into known inline elements only.
        collectInlineContent(Y, child, segments);
      }
      // Block elements inside a paragraph shouldn't exist in valid
      // ProseMirror docs, but if they do, we skip them here.
    }
  }
}

function collectParagraphFromSegments(
  _Y: typeof YModule,
  segments: Array<
    { type: 'text'; node: YModule.XmlText } | { type: 'elementRef'; displayText: string }
  >
): ParagraphInfo | null {
  let text = '';
  const offsetMap: ParagraphInfo['offsetMap'] = [];

  for (const seg of segments) {
    if (seg.type === 'text') {
      const delta = seg.node.toDelta() as DeltaOp[];
      for (const op of delta) {
        if (!op.insert) continue;
        for (let i = 0; i < op.insert.length; i++) {
          offsetMap.push({
            textNode: seg.node,
            offset: i + getTextLengthBefore(delta, op),
            elementRef: false,
          });
        }
        text += op.insert;
      }
    } else {
      // elementRef chip — include displayText in the flat text so the LLM
      // sees it, but mark these positions as non-markable so we don't try
      // to apply auto_review marks on XmlElement content.
      const displayText = seg.displayText;
      for (let i = 0; i < displayText.length; i++) {
        offsetMap.push({ elementRef: true });
      }
      text += displayText;
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
    // Clear ALL auto_review marks on this run — both the bare key
    // (backend-written) and any hashed keys (y-prosemirror-written).
    // Both can coexist on the same op after a client re-serialisation.
    const attrs = op.attributes;
    if (attrs) {
      const keysToRemove: Record<string, null> = {};
      for (const key of Object.keys(attrs)) {
        if (key === AUTO_REVIEW_MARK_NAME || key.startsWith(`${AUTO_REVIEW_MARK_NAME}--`)) {
          keysToRemove[key] = null;
        }
      }
      if (Object.keys(keysToRemove).length > 0) {
        text.format(offset, len, keysToRemove);
        cleared++;
      }
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

  // Skip suggestions that overlap any elementRef position — we can't
  // apply marks on XmlElement content, and trying would corrupt the chip.
  for (let i = start; i < end; i++) {
    if (paragraph.offsetMap[i].elementRef) return false;
  }

  // Find the XmlText + local offset for start and end.
  const startEntry = paragraph.offsetMap[start];
  const endEntry = paragraph.offsetMap[end - 1];

  if (!startEntry || !endEntry || startEntry.elementRef || endEntry.elementRef) {
    autoReviewLog.info(
      `applySuggestionMark failed: start=${start} end=${end} mapLen=${paragraph.offsetMap.length} ` +
        `startEntry=${startEntry ? 'ok' : 'null'} endEntry=${endEntry ? 'ok' : 'null'}`
    );
    return false;
  }

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

    // Filter out suggestions that overlap elementRef chip positions —
    // we can't apply marks on XmlElement content and the LLM shouldn't
    // be "correcting" proper-noun references anyway.
    const markableSuggestions = allSuggestions.filter((sug) => {
      const para = paragraphs[Number(sug.id.split('-')[0])];
      if (!para) return false;
      for (let i = sug.paragraphStart; i < sug.paragraphEnd; i++) {
        if (i >= para.offsetMap.length || para.offsetMap[i].elementRef) {
          autoReviewLog.info(
            `Skipping suggestion "${sug.originalText}" — overlaps elementRef at position ${i}`
          );
          return false;
        }
      }
      return true;
    });

    // Now mutate: clear old marks + apply new ones in a single transaction.
    let cleared = 0;
    let applied = 0;

    sharedDoc.doc.transact(() => {
      cleared = clearLintMarks(Y, fragment);
      for (const suggestion of markableSuggestions) {
        const para = paragraphs[Number(suggestion.id.split('-')[0])];
        if (para && applySuggestionMark(Y, para, suggestion)) {
          applied++;
        } else {
          autoReviewLog.info(
            `Could not apply mark for "${suggestion.originalText}" (offset mapping failed or overlaps elementRef)`
          );
        }
      }
    });

    autoReviewLog.info(
      `Review complete: ${applied}/${markableSuggestions.length} marks applied, ${cleared} cleared`
    );

    return {
      suggestions: markableSuggestions,
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
    const markInfo = getAutoReviewMarkKeyAndAttrs(op);
    if (markInfo && markInfo.attrs.id === suggestionId) {
      // Build a null-map for ALL auto_review keys on this op so both the
      // bare and hashed variants are stripped after the replacement.
      const nullMap: Record<string, null> = {};
      if (op.attributes) {
        for (const key of Object.keys(op.attributes)) {
          if (key === AUTO_REVIEW_MARK_NAME || key.startsWith(`${AUTO_REVIEW_MARK_NAME}--`)) {
            nullMap[key] = null;
          }
        }
      }
      text.delete(offset, len);
      if (replacement) {
        text.insert(offset, replacement, { ...op.attributes, ...nullMap });
      } else {
        text.format(offset, 0, nullMap);
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
    const markInfo = getAutoReviewMarkKeyAndAttrs(op);
    if (markInfo && markInfo.attrs.id === suggestionId) {
      // Strip ALL auto_review keys (bare + hashed) from this run.
      const nullMap: Record<string, null> = {};
      if (op.attributes) {
        for (const key of Object.keys(op.attributes)) {
          if (key === AUTO_REVIEW_MARK_NAME || key.startsWith(`${AUTO_REVIEW_MARK_NAME}--`)) {
            nullMap[key] = null;
          }
        }
      }
      text.format(offset, len, nullMap);
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
    const lintMark = getAutoReviewMarkAttrs(op);
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
