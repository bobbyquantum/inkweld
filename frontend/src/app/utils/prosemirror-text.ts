/**
 * Utilities for extracting plain text from ProseMirror JSON content.
 *
 * ProseMirror stores documents as a JSON tree of nodes. This module provides
 * utilities to flatten that tree into plain text for searching and indexing.
 */

interface ProseMirrorNode {
  type: string;
  text?: string;
  content?: ProseMirrorNode[];
  attrs?: Record<string, unknown>;
  marks?: unknown[];
}

/** A contiguous span of text extracted from a ProseMirror document */
export interface TextSpan {
  /** The plain text content */
  text: string;
  /** Character offset within the flattened document text */
  offset: number;
}

/** Node types that act as block-level containers (add spacing between them) */
const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'list_item',
  'bullet_list',
  'ordered_list',
  'code_block',
  'horizontal_rule',
  'doc',
]);

/**
 * Recursively extract text spans from ProseMirror JSON nodes,
 * returning each span with its character offset in the flattened string.
 *
 * @param nodes - Array of ProseMirror content nodes (the `content` array of a doc)
 * @returns Array of text spans in document order
 */
export function extractTextSpans(nodes: unknown[]): TextSpan[] {
  const spans: TextSpan[] = [];
  let offset = 0;

  function walk(node: ProseMirrorNode): void {
    if (
      node.type === 'text' &&
      typeof node.text === 'string' &&
      node.text.length > 0
    ) {
      spans.push({ text: node.text, offset });
      offset += node.text.length;
    } else if (Array.isArray(node.content)) {
      const prevOffset = offset;
      for (const child of node.content) {
        walk(child);
      }
      // Add semantic spacing after block nodes
      if (BLOCK_NODES.has(node.type) && offset > prevOffset) {
        offset += 1;
      }
    }
  }

  for (const node of nodes) {
    walk(node as ProseMirrorNode);
  }

  return spans;
}

/**
 * Flatten ProseMirror content nodes to a single plain-text string.
 * Inserts a space between block nodes so words at block boundaries
 * don't run together (e.g. "end.Beginning" → "end. Beginning").
 *
 * @param nodes - Array of ProseMirror content nodes
 * @returns Plain text representation
 */
export function flattenToPlainText(nodes: unknown[]): string {
  const parts: string[] = [];

  function walk(node: ProseMirrorNode): void {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
    } else if (Array.isArray(node.content)) {
      const lengthBefore = parts.length;
      for (const child of node.content) {
        walk(child);
      }
      // Add a space after block nodes so adjacent words don't merge
      if (BLOCK_NODES.has(node.type) && parts.length > lengthBefore) {
        parts.push(' ');
      }
    }
  }

  for (const node of nodes) {
    walk(node as ProseMirrorNode);
  }

  return parts.join('');
}
